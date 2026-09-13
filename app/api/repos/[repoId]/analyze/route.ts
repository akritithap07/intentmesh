import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAuthenticatedGithubUser } from '@/lib/github';
import { getOrCreateUser, getRepoByIdAndUser, createAnalysis } from '@/lib/db-service';
import { publishAnalysisJob } from '@/lib/qstash';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const session = await auth();

  if (!session || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { repoId } = await params;

  if (!repoId) {
    return NextResponse.json({ error: 'Missing repoId parameter' }, { status: 400 });
  }

  try {
    // 1. Resolve DB user
    const githubUser = await getAuthenticatedGithubUser(session.accessToken);
    const dbUser = await getOrCreateUser({
      github_user_id: githubUser.id,
      email: githubUser.email || session.user?.email,
      name: githubUser.name || session.user?.name,
      avatar_url: githubUser.avatar_url || session.user?.image,
    });

    // 2. Server-side security check: Verify user owns the repo
    const repo = await getRepoByIdAndUser(repoId, dbUser.id);
    if (!repo) {
      return NextResponse.json({ error: 'Repository not found or access denied' }, { status: 404 });
    }

    // 3. Create queued analysis record in DB
    const analysis = await createAnalysis(repo.id);

    // 4. Publish background job via QStash
    await publishAnalysisJob({
      analysisId: analysis.id,
      repoId: repo.id,
    });

    return NextResponse.json(
      {
        analysisId: analysis.id,
        repoId: repo.id,
        status: analysis.status,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('Failed to create analysis job:', error);
    return NextResponse.json({ error: 'Failed to initiate repository analysis' }, { status: 500 });
  }
}
