import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { auth } from '@/lib/auth';
import { getAuthenticatedGithubUser } from '@/lib/github';
import { getOrCreateUser, getRepoByIdAndUser, createSyncJob, getRecentSyncJobs } from '@/lib/db-service';
import { publishSyncJob } from '@/lib/qstash';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const session = await auth();

  if (!session || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { repoId } = await params;

  try {
    const githubUser = await getAuthenticatedGithubUser(session.accessToken);
    const dbUser = await getOrCreateUser({
      github_user_id: githubUser.id,
      email: githubUser.email || session.user?.email,
      name: githubUser.name || session.user?.name,
      avatar_url: githubUser.avatar_url || session.user?.image,
    });

    const repo = await getRepoByIdAndUser(repoId, dbUser.id);
    if (!repo) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    const jobs = await getRecentSyncJobs(repo.id, 5);
    return NextResponse.json({ syncJobs: jobs }, { status: 200 });
  } catch (error) {
    console.error('Failed fetching sync jobs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const session = await auth();

  if (!session || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { repoId } = await params;

  try {
    const githubUser = await getAuthenticatedGithubUser(session.accessToken);
    const dbUser = await getOrCreateUser({
      github_user_id: githubUser.id,
      email: githubUser.email || session.user?.email,
      name: githubUser.name || session.user?.name,
      avatar_url: githubUser.avatar_url || session.user?.image,
    });

    const repo = await getRepoByIdAndUser(repoId, dbUser.id);
    if (!repo) {
      return NextResponse.json({ error: 'Repository not found or access denied' }, { status: 404 });
    }

    const manualDeliveryId = `manual_${crypto.randomUUID()}`;

    const syncJob = await createSyncJob({
      repo_id: repo.id,
      github_delivery_id: manualDeliveryId,
      event_type: 'manual',
      commit_sha: repo.default_branch,
    });

    await publishSyncJob({
      syncJobId: syncJob.id,
      repoId: repo.id,
      commitSha: repo.default_branch,
    });

    return NextResponse.json(
      {
        syncJobId: syncJob.id,
        status: syncJob.status,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('Failed triggering manual sync:', error);
    return NextResponse.json({ error: 'Failed triggering manual sync' }, { status: 500 });
  }
}
