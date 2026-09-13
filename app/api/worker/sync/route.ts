import { NextResponse } from 'next/server';
import {
  getSyncJobById,
  getRepoById,
  updateSyncJob,
  createAnalysis,
  updateAnalysis,
  updateRepoLastAnalyzed,
} from '@/lib/db-service';
import { fetchRepoContents } from '@/lib/github-ingest';
import { analyzeCodebaseWithTsMorph } from '@/lib/analysis/ts-morph-analyzer';
import { generateMermaidDiagram } from '@/lib/analysis/mermaid-generator';
import { indexRepositoryChunks } from '@/lib/retrieval';
import { z } from 'zod';

const syncWorkerPayloadSchema = z.object({
  syncJobId: z.string().uuid(),
  repoId: z.string().uuid(),
  commitSha: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = syncWorkerPayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid sync worker payload', details: parsed.error.format() }, { status: 400 });
    }

    const { syncJobId, repoId, commitSha: payloadCommitSha } = parsed.data;

    // 1. Fetch sync job
    const syncJob = await getSyncJobById(syncJobId);
    if (!syncJob) {
      return NextResponse.json({ error: 'Sync job record not found' }, { status: 404 });
    }

    if (syncJob.status === 'completed') {
      return NextResponse.json({ message: 'Sync job already completed', syncJobId }, { status: 200 });
    }

    // 2. Mark RUNNING
    await updateSyncJob(syncJobId, {
      status: 'running',
      started_at: new Date(),
      error_message: null,
    });

    // 3. Fetch repo
    const repo = await getRepoById(repoId);
    if (!repo) {
      await updateSyncJob(syncJobId, {
        status: 'failed',
        error_message: 'Repository not found',
      });
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    const [owner, repoName] = repo.full_name.split('/');
    if (!owner || !repoName) {
      await updateSyncJob(syncJobId, {
        status: 'failed',
        error_message: 'Invalid repo full_name',
      });
      return NextResponse.json({ error: 'Invalid repository name' }, { status: 400 });
    }

    const accessToken = process.env.GITHUB_TOKEN || process.env.GITHUB_CLIENT_SECRET || '';

    // 4. Change-Aware Reanalysis: Fetch repository contents for the push commit
    let targetCommitSha = payloadCommitSha || syncJob.commit_sha || repo.default_branch;
    let files: Array<{ path: string; content: string }> = [];

    try {
      const result = await fetchRepoContents(accessToken, owner, repoName, targetCommitSha);
      targetCommitSha = result.commitSha;
      files = result.files;
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`[Sync Worker] Failed fetching push commit files for ${repo.full_name}:`, error);
      await updateSyncJob(syncJobId, {
        status: 'failed',
        error_message: `GitHub fetch failed: ${error.message || 'Unknown error'}`,
      });
      return NextResponse.json({ error: 'Failed fetching push commit contents' }, { status: 500 });
    }

    // 5. Create a NEW versioned analysis record (preserving previous successful analysis history)
    const newAnalysis = await createAnalysis(repoId);
    await updateAnalysis(newAnalysis.id, {
      status: 'running',
      started_at: new Date(),
    });

    // 6. Perform deterministic analysis & Mermaid generation
    const { architectureData } = analyzeCodebaseWithTsMorph(files, targetCommitSha);
    const mermaidDiagram = generateMermaidDiagram(architectureData.modules);

    // 7. Rebuild chunks & embeddings for the new analysis version
    try {
      await indexRepositoryChunks(repoId, newAnalysis.id, files);
    } catch (indexErr) {
      console.warn(`[Sync Worker] Warning indexing chunks for sync:`, indexErr);
    }

    // 8. Complete new analysis record
    await updateAnalysis(newAnalysis.id, {
      status: 'completed',
      commit_sha: targetCommitSha,
      architecture_data: architectureData as unknown as Record<string, unknown>,
      mermaid_diagram: mermaidDiagram,
      completed_at: new Date(),
    });

    // 9. Complete sync job & update repo last_analyzed_at
    await updateSyncJob(syncJobId, {
      status: 'completed',
      commit_sha: targetCommitSha,
      completed_at: new Date(),
    });

    await updateRepoLastAnalyzed(repoId);

    console.log(`[Sync Worker] Successfully completed sync job ${syncJobId} for ${repo.full_name}`);
    return NextResponse.json({ message: 'Sync job completed successfully', syncJobId, analysisId: newAnalysis.id }, { status: 200 });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[Sync Worker] Fatal error running sync job:', err);
    return NextResponse.json({ error: 'Sync worker error' }, { status: 500 });
  }
}
