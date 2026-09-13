import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAuthenticatedGithubUser, getRepoDetails } from '@/lib/github';
import { getOrCreateUser, connectRepository, getUserConnectedRepos } from '@/lib/db-service';
import { z } from 'zod';

const connectRepoSchema = z.object({
  full_name: z.string().min(1, 'Repository full name is required'),
  installation_id: z.number().optional().default(1),
});

export async function GET() {
  const session = await auth();

  if (!session || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const githubUser = await getAuthenticatedGithubUser(session.accessToken);
    const dbUser = await getOrCreateUser({
      github_user_id: githubUser.id,
      email: githubUser.email || session.user?.email,
      name: githubUser.name || session.user?.name,
      avatar_url: githubUser.avatar_url || session.user?.image,
    });

    const repos = await getUserConnectedRepos(dbUser.id);
    return NextResponse.json({ repos }, { status: 200 });
  } catch (error) {
    console.error('Failed to get connected repos:', error);
    return NextResponse.json({ error: 'Failed to retrieve connected repositories' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();

  if (!session || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = connectRepoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { full_name, installation_id } = parsed.data;
    const [owner, repoName] = full_name.split('/');

    if (!owner || !repoName) {
      return NextResponse.json({ error: 'Invalid repository name format' }, { status: 400 });
    }

    // SERVER-SIDE SECURITY CHECK: verify user has access via GitHub API
    let repoDetails;
    try {
      repoDetails = await getRepoDetails(session.accessToken, owner, repoName);
    } catch (err: unknown) {
      const error = err as { status?: number };
      if (error.status === 404 || error.status === 403) {
        return NextResponse.json(
          { error: 'Repository not found or access denied on GitHub' },
          { status: 403 }
        );
      }
      throw err;
    }

    // Resolve or create user record in PostgreSQL
    const githubUser = await getAuthenticatedGithubUser(session.accessToken);
    const dbUser = await getOrCreateUser({
      github_user_id: githubUser.id,
      email: githubUser.email || session.user?.email,
      name: githubUser.name || session.user?.name,
      avatar_url: githubUser.avatar_url || session.user?.image,
    });

    // Persist repository connection
    const connectedRepo = await connectRepository({
      user_id: dbUser.id,
      github_repo_id: repoDetails.id,
      full_name: repoDetails.full_name,
      default_branch: repoDetails.default_branch,
      installation_id: installation_id || repoDetails.installation_id,
    });

    return NextResponse.json({ repo: connectedRepo }, { status: 201 });
  } catch (error) {
    console.error('Failed to connect repository:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
