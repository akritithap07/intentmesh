import { Client } from '@upstash/qstash';

export async function publishAnalysisJob(payload: { analysisId: string; repoId: string }) {
  const token = process.env.QSTASH_TOKEN;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const targetUrl = `${baseUrl}/api/worker/analyze`;

  if (token) {
    try {
      const qstash = new Client({ token });
      await qstash.publishJSON({
        url: targetUrl,
        body: payload,
      });
      console.log(`[QStash] Enqueued analysis job ${payload.analysisId} to ${targetUrl}`);
      return;
    } catch (err) {
      console.error('[QStash] Failed to publish analysis job via QStash:', err);
    }
  }

  // Local fallback trigger
  console.log(`[QStash Fallback] Triggering local worker at ${targetUrl}`);
  fetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((err) => console.error('[QStash Fallback] Failed to trigger local worker:', err));
}

export async function publishSyncJob(payload: { syncJobId: string; repoId: string; commitSha?: string | null }) {
  const token = process.env.QSTASH_TOKEN;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const targetUrl = `${baseUrl}/api/worker/sync`;

  if (token) {
    try {
      const qstash = new Client({ token });
      await qstash.publishJSON({
        url: targetUrl,
        body: payload,
      });
      console.log(`[QStash] Enqueued sync job ${payload.syncJobId} to ${targetUrl}`);
      return;
    } catch (err) {
      console.error('[QStash] Failed to publish sync job via QStash:', err);
    }
  }

  // Local fallback trigger
  console.log(`[QStash Fallback] Triggering local sync worker at ${targetUrl}`);
  fetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((err) => console.error('[QStash Fallback] Failed to trigger local sync worker:', err));
}
