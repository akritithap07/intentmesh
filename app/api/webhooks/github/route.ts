import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getRepoByGithubRepoId, getSyncJobByDeliveryId, createSyncJob } from '@/lib/db-service';
import { publishSyncJob } from '@/lib/qstash';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');
    const deliveryId = req.headers.get('x-github-delivery');
    const eventType = req.headers.get('x-github-event');

    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

    // 1. HMAC SHA-256 Signature Verification
    if (webhookSecret && signature) {
      const hmac = crypto.createHmac('sha256', webhookSecret);
      const computedSignature = 'sha256=' + hmac.update(rawBody).digest('hex');

      const sigBuffer = Buffer.from(signature);
      const compBuffer = Buffer.from(computedSignature);

      if (sigBuffer.length !== compBuffer.length || !crypto.timingSafeEqual(sigBuffer, compBuffer)) {
        console.warn('[Webhook] Invalid HMAC SHA-256 signature rejected');
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
    }

    if (!deliveryId || !eventType) {
      return NextResponse.json({ error: 'Missing required GitHub webhook headers' }, { status: 400 });
    }

    // 2. Event filtering: support push events
    if (eventType !== 'push') {
      return NextResponse.json({ message: `Event type '${eventType}' acknowledged (no action required)` }, { status: 200 });
    }

    const payload = JSON.parse(rawBody);

    const githubRepoId = payload.repository?.id;
    if (!githubRepoId) {
      return NextResponse.json({ error: 'Missing repository ID in payload' }, { status: 400 });
    }

    // 3. Find matching repository in database
    const repo = await getRepoByGithubRepoId(githubRepoId);
    if (!repo) {
      return NextResponse.json({ message: 'Repository not connected in IntentMesh' }, { status: 200 });
    }

    // 4. Check auto_sync_enabled
    if (!repo.auto_sync_enabled) {
      return NextResponse.json({ message: 'Auto sync is disabled for this repository' }, { status: 200 });
    }

    // 5. Deduplicate delivery ID
    const existingJob = await getSyncJobByDeliveryId(deliveryId);
    if (existingJob) {
      return NextResponse.json({ message: 'Duplicate delivery ID ignored', syncJobId: existingJob.id }, { status: 200 });
    }

    // 6. Extract changed files from commits payload
    const changedFilesSet = new Set<string>();
    if (Array.isArray(payload.commits)) {
      for (const commit of payload.commits) {
        if (Array.isArray(commit.added)) commit.added.forEach((f: string) => changedFilesSet.add(f));
        if (Array.isArray(commit.modified)) commit.modified.forEach((f: string) => changedFilesSet.add(f));
        if (Array.isArray(commit.removed)) commit.removed.forEach((f: string) => changedFilesSet.add(f));
      }
    }

    const changedFiles = Array.from(changedFilesSet);
    const commitSha = payload.after || payload.head_commit?.id || repo.default_branch;

    // 7. Create sync_jobs record
    const syncJob = await createSyncJob({
      repo_id: repo.id,
      github_delivery_id: deliveryId,
      event_type: eventType,
      commit_sha: commitSha,
      changed_files: changedFiles,
    });

    // 8. Enqueue background sync job
    await publishSyncJob({
      syncJobId: syncJob.id,
      repoId: repo.id,
      commitSha,
    });

    return NextResponse.json(
      {
        syncJobId: syncJob.id,
        status: syncJob.status,
        changedFileCount: changedFiles.length,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('[Webhook] Failed processing GitHub webhook:', error);
    return NextResponse.json({ error: 'Internal server error processing webhook' }, { status: 500 });
  }
}
