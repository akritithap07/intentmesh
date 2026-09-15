import { NextResponse } from 'next/server';
import { getAnalysisById, getRepoById, updateAnalysis, updateRepoLastAnalyzed } from '@/lib/db-service';
import { fetchRepoContents } from '@/lib/github-ingest';
import { analyzeCodebaseWithTsMorph } from '@/lib/analysis/ts-morph-analyzer';
import { generateMermaidDiagram } from '@/lib/analysis/mermaid-generator';
import { indexRepositoryChunks } from '@/lib/retrieval';
import { verifyQStashSignature } from '@/lib/qstash';
import { z } from 'zod';

const workerPayloadSchema = z.object({
  analysisId: z.string().uuid(),
  repoId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('upstash-signature');

    const isValidSignature = await verifyQStashSignature(signature, rawBody);
    if (!isValidSignature) {
      console.warn('[Worker] Rejected request with missing or invalid QStash signature');
      return NextResponse.json({ error: 'Invalid or missing QStash signature' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    const parsed = workerPayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid worker payload', details: parsed.error.format() }, { status: 400 });
    }

    const { analysisId, repoId } = parsed.data;

    // 1. Fetch analysis record
    const analysis = await getAnalysisById(analysisId);
    if (!analysis) {
      return NextResponse.json({ error: 'Analysis record not found' }, { status: 404 });
    }

    // Idempotency: skip if already completed
    if (analysis.status === 'completed') {
      return NextResponse.json({ message: 'Analysis already completed', analysisId }, { status: 200 });
    }

    // 2. Mark RUNNING
    await updateAnalysis(analysisId, {
      status: 'running',
      started_at: new Date(),
      error_message: null,
    });

    // 3. Fetch repo metadata
    const repo = await getRepoById(repoId);
    if (!repo) {
      await updateAnalysis(analysisId, {
        status: 'failed',
        error_message: 'Repository not found in database',
      });
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    // 4. Ingest repository files from GitHub
    const [owner, repoName] = repo.full_name.split('/');
    if (!owner || !repoName) {
      await updateAnalysis(analysisId, {
        status: 'failed',
        error_message: 'Invalid repo full_name format',
      });
      return NextResponse.json({ error: 'Invalid repository name' }, { status: 400 });
    }

    const accessToken = process.env.GITHUB_TOKEN;
    if (!accessToken) {
      await updateAnalysis(analysisId, {
        status: 'failed',
        error_message: 'Server GitHub access token (GITHUB_TOKEN) is not configured.',
      });
      return NextResponse.json({ error: 'GitHub access token not configured' }, { status: 500 });
    }

    let commitSha = 'main';
    let files: Array<{ path: string; content: string }> = [];

    try {
      const result = await fetchRepoContents(accessToken, owner, repoName, repo.default_branch);
      commitSha = result.commitSha;
      files = result.files;
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`[Worker] Failed fetching repo contents for ${repo.full_name}:`, error);
      await updateAnalysis(analysisId, {
        status: 'failed',
        error_message: `GitHub fetch failed: ${error.message || 'Unknown error'}`,
      });
      return NextResponse.json({ error: 'Failed to fetch repository files' }, { status: 500 });
    }

    // 5. Analyze codebase using ts-morph
    const { architectureData } = analyzeCodebaseWithTsMorph(files, commitSha);

    // 6. Generate Mermaid diagram
    const mermaidDiagram = generateMermaidDiagram(architectureData.modules);

    // 7. Index chunks & embeddings for RAG Q&A
    try {
      await indexRepositoryChunks(repoId, analysisId, files);
    } catch (indexErr) {
      console.warn(`[Worker] Warning: failed indexing chunks for RAG:`, indexErr);
    }

    // 8. Persist analysis results
    await updateAnalysis(analysisId, {
      status: 'completed',
      commit_sha: commitSha,
      architecture_data: architectureData as unknown as Record<string, unknown>,
      mermaid_diagram: mermaidDiagram,
      completed_at: new Date(),
    });

    // 9. Update repo last_analyzed_at
    await updateRepoLastAnalyzed(repoId);

    console.log(`[Worker] Successfully completed analysis and indexing for ${analysisId} (${repo.full_name})`);
    return NextResponse.json({ message: 'Analysis completed successfully', analysisId }, { status: 200 });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[Worker] Fatal error running analysis:', err);
    return NextResponse.json({ error: 'Worker error' }, { status: 500 });
  }
}