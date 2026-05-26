import { NextRequest, NextResponse } from 'next/server';

async function getFileSha(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
): Promise<string | undefined> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'Cache-Control': 'no-cache',
      },
    }
  );

  if (!res.ok) return undefined;

  const json = await res.json();
  return typeof json.sha === 'string' ? json.sha : undefined;
}

async function pushFile(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  attempt = 1,
): Promise<void> {

  const sha = await getFileSha(accessToken, owner, repo, path);

  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
  };

  if (sha) body.sha = sha;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (res.ok) return;

  const err = await res.json().catch(() => ({}));
  const msg = err?.message ?? `HTTP ${res.status}`;

  if ((res.status === 409 || res.status === 422) && attempt === 1) {
    console.warn(`[push-to-repo] SHA conflict on ${path}, retrying...`);
    return pushFile(accessToken, owner, repo, path, content, message, 2);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `GitHub permission denied. Check OAuth repo permissions.`
    );
  }

  throw new Error(`Failed to push ${path}: ${msg}`);
}

export async function POST(request: NextRequest) {
  try {

    const {
      accessToken,
      owner,
      repo,
      readme,
      diagram,
    } = await request.json();

    if (!accessToken || !owner || !repo || !readme || !diagram) {
      return NextResponse.json(
        { error: 'Missing required fields.' },
        { status: 400 }
      );
    }

    // ALWAYS UPDATE REAL README
    const readmePath = 'README.md';

    const diagramBlock = `

\`\`\`mermaid
${diagram}
\`\`\`
`;

    let readmeWithDiagram: string;

    const archHeadingRegex =
      /(## 🏗️ Architecture[\s\S]*?)(\n## )/;

    if (archHeadingRegex.test(readme)) {
      readmeWithDiagram = readme.replace(
        archHeadingRegex,
        `$1${diagramBlock}$2`
      );
    } else {
      readmeWithDiagram =
        readme.trimEnd() +
        '\n\n## 🏗️ Architecture\n' +
        diagramBlock;
    }

    await pushFile(
      accessToken,
      owner,
      repo,
      readmePath,
      readmeWithDiagram,
      '📝 Update README via IntentMesh'
    );

    return NextResponse.json({
      success: true,
      path: readmePath,
    });

  } catch (error) {

    const message =
      error instanceof Error
        ? error.message
        : 'Unknown error';

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}