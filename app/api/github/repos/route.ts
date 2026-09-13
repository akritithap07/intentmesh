import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserAvailableRepos } from '@/lib/github';

export async function GET() {
  const session = await auth();

  if (!session || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const repos = await getUserAvailableRepos(session.accessToken);
    return NextResponse.json({ repos }, { status: 200 });
  } catch (error) {
    console.error('Failed to fetch GitHub repos:', error);
    return NextResponse.json({ error: 'Failed to fetch repositories from GitHub' }, { status: 500 });
  }
}
