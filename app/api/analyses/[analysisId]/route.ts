import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAuthenticatedGithubUser } from '@/lib/github';
import { getOrCreateUser, getAnalysisById, getRepoById } from '@/lib/db-service';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  const session = await auth();

  if (!session || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { analysisId } = await params;

  if (!analysisId) {
    return NextResponse.json({ error: 'Missing analysisId parameter' }, { status: 400 });
  }

  try {
    // 1. Fetch analysis record
    const analysis = await getAnalysisById(analysisId);
    if (!analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    // 2. Fetch repo and verify ownership
    const repo = await getRepoById(analysis.repo_id);
    if (!repo) {
      return NextResponse.json({ error: 'Associated repository not found' }, { status: 404 });
    }

    const githubUser = await getAuthenticatedGithubUser(session.accessToken);
    const dbUser = await getOrCreateUser({
      github_user_id: githubUser.id,
      email: githubUser.email || session.user?.email,
      name: githubUser.name || session.user?.name,
      avatar_url: githubUser.avatar_url || session.user?.image,
    });

    if (repo.user_id !== dbUser.id) {
      return NextResponse.json({ error: 'Unauthorized access to analysis' }, { status: 403 });
    }

    return NextResponse.json(
      {
        id: analysis.id,
        repo_id: analysis.repo_id,
        status: analysis.status,
        commit_sha: analysis.commit_sha,
        started_at: analysis.started_at,
        completed_at: analysis.completed_at,
        error_message: analysis.error_message,
        architecture_data: analysis.architecture_data,
        mermaid_diagram: analysis.mermaid_diagram,
        created_at: analysis.created_at,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to get analysis:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
