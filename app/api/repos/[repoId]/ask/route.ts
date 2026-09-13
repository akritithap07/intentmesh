import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAuthenticatedGithubUser } from '@/lib/github';
import { getOrCreateUser, getRepoByIdAndUser, getLatestCompletedAnalysis } from '@/lib/db-service';
import { runAgenticQnA } from '@/lib/agent';
import { askQuestionSchema } from '@/db/schema';

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
    const body = await req.json();
    const parsed = askQuestionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid question format', details: parsed.error.format() }, { status: 400 });
    }

    const { question } = parsed.data;

    // 1. Resolve DB user
    const githubUser = await getAuthenticatedGithubUser(session.accessToken);
    const dbUser = await getOrCreateUser({
      github_user_id: githubUser.id,
      email: githubUser.email || session.user?.email,
      name: githubUser.name || session.user?.name,
      avatar_url: githubUser.avatar_url || session.user?.image,
    });

    // 2. Security Check: Verify user owns repoId
    const repo = await getRepoByIdAndUser(repoId, dbUser.id);
    if (!repo) {
      return NextResponse.json({ error: 'Repository not found or access denied' }, { status: 404 });
    }

    // 3. Verify repository has a completed analysis
    const analysis = await getLatestCompletedAnalysis(repo.id);
    if (!analysis) {
      return NextResponse.json(
        { error: 'Repository has no completed analysis. Run repository analysis first.' },
        { status: 400 }
      );
    }

    // 4. Run bounded agentic tool loop
    const result = await runAgenticQnA(repo.id, question);

    return NextResponse.json(
      {
        answer: result.answer,
        sources: result.sources,
        toolsUsed: result.toolsUsed,
        totalToolCalls: result.totalToolCalls,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed processing agentic repository Q&A request:', error);
    return NextResponse.json({ error: 'Internal server error processing agentic Q&A request' }, { status: 500 });
  }
}
