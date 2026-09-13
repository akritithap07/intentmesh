import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAuthenticatedGithubUser } from '@/lib/github';
import { getOrCreateUser, getRepoByIdAndUser, getLatestCompletedAnalysis } from '@/lib/db-service';
import { generateVerifiedDocumentation } from '@/lib/documentation';

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

    const latestAnalysis = await getLatestCompletedAnalysis(repo.id);
    if (!latestAnalysis) {
      return NextResponse.json(
        { error: 'Repository has no completed analysis. Please run analysis first.' },
        { status: 400 }
      );
    }

    const docVersion = await generateVerifiedDocumentation(repo.id, latestAnalysis.id);
    return NextResponse.json({ docVersion }, { status: 201 });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed generating documentation:', err);
    return NextResponse.json({ error: 'Internal error generating documentation' }, { status: 500 });
  }
}
