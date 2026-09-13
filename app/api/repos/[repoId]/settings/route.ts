import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAuthenticatedGithubUser } from '@/lib/github';
import { getOrCreateUser, getRepoByIdAndUser, updateRepoAutoSync } from '@/lib/db-service';
import { toggleAutoSyncSchema } from '@/db/schema';

export async function PATCH(
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
    const parsed = toggleAutoSyncSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid settings payload', details: parsed.error.format() }, { status: 400 });
    }

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

    const updatedRepo = await updateRepoAutoSync(repo.id, parsed.data.auto_sync_enabled);
    return NextResponse.json({ repo: updatedRepo }, { status: 200 });
  } catch (error) {
    console.error('Failed updating repository settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
