import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAuthenticatedGithubUser } from '@/lib/github';
import {
  getOrCreateUser,
  getRepoByIdAndUser,
  getLatestDocVersionForRepo,
  getDocumentationPrByVersion,
} from '@/lib/db-service';

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

    const docVersion = await getLatestDocVersionForRepo(repo.id);
    let docPr = null;

    if (docVersion) {
      docPr = await getDocumentationPrByVersion(docVersion.id);
    }

    return NextResponse.json({ docVersion, docPr }, { status: 200 });
  } catch (error) {
    console.error('Failed fetching documentation details:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
