import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAuthenticatedGithubUser } from '@/lib/github';
import {
  getOrCreateUser,
  getRepoByIdAndUser,
  getDocVersionById,
  getDocumentationPrByVersion,
  createDocumentationPrRecord,
} from '@/lib/db-service';
import { createDocumentationPullRequest } from '@/lib/github-pr';
import { createPrSchema } from '@/db/schema';

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
    const body = await req.json();
    const parsed = createPrSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid PR payload', details: parsed.error.format() }, { status: 400 });
    }

    const { docVersionId } = parsed.data;

    // 1. Resolve user and verify repo ownership
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

    // 2. Fetch docVersion and check status === 'verified'
    const docVersion = await getDocVersionById(docVersionId);
    if (!docVersion || docVersion.repo_id !== repo.id) {
      return NextResponse.json({ error: 'Documentation version not found' }, { status: 404 });
    }

    if (docVersion.status !== 'verified') {
      return NextResponse.json(
        { error: 'Cannot create Pull Request for documentation that has not passed verification.' },
        { status: 400 }
      );
    }

    // 3. Idempotency Check: Prevent duplicate PR creation for same doc version
    const existingPr = await getDocumentationPrByVersion(docVersion.id);
    if (existingPr) {
      return NextResponse.json({ docPr: existingPr, message: 'PR already created for this version' }, { status: 200 });
    }

    // 4. Server-side Octokit: Create branch, commit README.md, open PR
    const [owner, repoName] = repo.full_name.split('/');
    if (!owner || !repoName) {
      return NextResponse.json({ error: 'Invalid repository name format' }, { status: 400 });
    }

    const prResult = await createDocumentationPullRequest(
      session.accessToken,
      owner,
      repoName,
      { id: docVersion.id, content: docVersion.content },
      repo.default_branch
    );

    // 5. Persist PR record
    const prRecord = await createDocumentationPrRecord({
      repo_id: repo.id,
      documentation_version_id: docVersion.id,
      branch_name: prResult.branchName,
      pull_request_number: prResult.pullRequestNumber,
      pull_request_url: prResult.pullRequestUrl,
    });

    return NextResponse.json({ docPr: prRecord }, { status: 201 });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed creating documentation Pull Request:', err);
    return NextResponse.json({ error: err.message || 'Internal error creating PR' }, { status: 500 });
  }
}
