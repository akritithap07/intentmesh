import { NextRequest, NextResponse } from 'next/server';

// Fetch the current SHA of a file (undefined if it doesn't exist yet)
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
        // Bypass CDN cache so we always get the true current SHA
        'Cache-Control': 'no-cache',
      },
    }
  );
  if (!res.ok) return undefined;
  const json = await res.json();
  return typeof json.sha === 'string' ? json.sha : undefined;
}

// Push a single file — fetches a fresh SHA immediately before the PUT,
// and retries once if GitHub returns a 409/422 SHA conflict.
async function pushFile(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  attempt = 1,
): Promise<void> {
  // Always fetch the freshest possible SHA right before pushing
  const sha = await getFileSha(accessToken, owner, repo, path);

  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content, 'utf-8').toString('base64'),
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
  const msg: string = err?.message ?? `HTTP ${res.status}`;

  // 409 Conflict or 422 Unprocessable = SHA mismatch — retry once with a fresh SHA
  if ((res.status === 409 || res.status === 422) && attempt === 1) {
    console.warn(`[push-to-repo] SHA conflict on ${path}, retrying…`);
    return pushFile(accessToken, owner, repo, path, content, message, 2);
  }

  // 401 / 403 — surface a clear message
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `GitHub permission denied for ${path}. Make sure your OAuth token has the "repo" scope.`
    );
  }

  throw new Error(`Failed to push ${path}: ${msg}`);
}

export async function POST(request: NextRequest) {
  try {
    const { accessToken, owner, repo, readme, diagram, replaceReadme } =
      await request.json();

    if (!accessToken || !owner || !repo || !readme || !diagram) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    const readmePath = replaceReadme ? 'README.md' : 'README-intentmesh.md';

    // Embed the Mermaid diagram directly after the Architecture section in the README.
    // We look for the ## 🏗️ Architecture heading and insert a mermaid fence after the
    // section's prose (i.e. before the next ## heading). If the heading isn't found we
    // append the diagram at the end so it's never lost.
    const diagramBlock = `\n\`\`\`mermaid\n${diagram}\n\`\`\`\n`;

    let readmeWithDiagram: string;
    const archHeadingRegex = /(## 🏗️ Architecture[\s\S]*?)(\n## )/;
    if (archHeadingRegex.test(readme)) {
      // Insert the diagram block just before the next ## section
      readmeWithDiagram = readme.replace(archHeadingRegex, `$1${diagramBlock}$2`);
    } else {
      // Fallback: append at end
      readmeWithDiagram = readme.trimEnd() + '\n\n## 🏗️ Architecture\n' + diagramBlock;
    }

    // Push only the README — diagram is now embedded inside it
    await pushFile(accessToken, owner, repo, readmePath, readmeWithDiagram, '📝 Add IntentMesh generated README with architecture diagram');

    return NextResponse.json({ success: true });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}