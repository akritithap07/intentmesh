import { NextRequest, NextResponse } from 'next/server';
import { parseGitHubUrl, analyzeRepository, findPotentialContributors } from '@/services/githubService';
import { inferArchitecture } from '@/services/architectureEngine';
import { generateMermaidDiagram } from '@/services/diagramEngine';
import {
  generateReadme,
  generateAdvancedDiagram,
  generateContributorOutreach,
  UserAnswers,
} from '@/services/llmService';

// ─── Custom Error Classes ─────────────────────────────────────────────────────

class ValidationError extends Error {
  constructor(msg: string) { super(msg); this.name = 'ValidationError'; }
}
class NotFoundError extends Error {
  constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
}
class RateLimitError extends Error {
  constructor(msg: string) { super(msg); this.name = 'RateLimitError'; }
}

// ─── Input Validation ─────────────────────────────────────────────────────────

function validateBody(body: unknown): {
  url: string;
  accessToken: string;
  userAnswers?: UserAnswers;
} {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object.');
  }

  const { url, accessToken, userAnswers } = body as Record<string, unknown>;

  if (!url || typeof url !== 'string' || url.trim() === '') {
    throw new ValidationError('GitHub URL is required.');
  }
  if (!url.toString().includes('github.com')) {
    throw new ValidationError('URL must be a valid GitHub repository URL.');
  }

  return {
    url:         url.trim(),
    // ✅ FIX: Read token from request body (matching what the frontend sends)
    //    The frontend does: body: JSON.stringify({ url, accessToken, userAnswers })
    accessToken: typeof accessToken === 'string' ? accessToken.trim() : '',
    userAnswers: userAnswers as UserAnswers | undefined,
  };
}

// ─── Timeout Wrapper ──────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[Timeout] ${label} exceeded ${ms}ms`)), ms)
    ),
  ]);
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    // ── 1. Parse + validate body ────────────────────────────────────────────
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      throw new ValidationError('Request body is not valid JSON.');
    }

    const { url, accessToken, userAnswers } = validateBody(rawBody);

    // ── 2. Parse GitHub URL ─────────────────────────────────────────────────
    let owner: string, repo: string;
    try {
      ({ owner, repo } = parseGitHubUrl(url));
    } catch {
      throw new ValidationError(
        'Could not parse GitHub URL. Expected: https://github.com/owner/repo'
      );
    }

    console.info(`[${requestId}] Analyzing ${owner}/${repo}`);

    // ── 3. Fetch repo data ──────────────────────────────────────────────────
    let analysis: Awaited<ReturnType<typeof analyzeRepository>>;
    try {
      analysis = await withTimeout(
        analyzeRepository(owner, repo, accessToken),
        15_000,
        'analyzeRepository'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404') || msg.toLowerCase().includes('not found'))
        throw new NotFoundError(`Repository "${owner}/${repo}" not found. Check the URL or your access token.`);
      if (msg.includes('403') || msg.toLowerCase().includes('rate limit'))
        throw new RateLimitError('GitHub API rate limit exceeded. Provide a personal access token.');
      if (msg.includes('401') || msg.toLowerCase().includes('unauthorized'))
        throw new ValidationError('GitHub access token is invalid or expired.');
      throw err;
    }

    const languages = Object.keys(analysis.languages);

    // ── 4. Infer architecture ────────────────────────────────────────────────
    const architecture = inferArchitecture(
      analysis.languages,
      analysis.metadata.topics,
      userAnswers?.techStack
    );

    // ── 5. Rule-based fallback diagram (always succeeds) ─────────────────────
    const simpleDiagram = generateMermaidDiagram(architecture);

    // ── 6. Find potential contributors (non-fatal) ────────────────────────────
    const existingUsernames = analysis.existingContributors.map(c => c.username);
    let potentialContributors: Awaited<ReturnType<typeof findPotentialContributors>> = [];
    try {
      potentialContributors = await withTimeout(
        findPotentialContributors(languages, analysis.metadata.topics, existingUsernames, accessToken),
        10_000,
        'findPotentialContributors'
      );
    } catch (err) {
      // Non-fatal: contributor search is best-effort
      console.warn(`[${requestId}] findPotentialContributors failed (continuing):`, err);
    }

    // ── 7. Run all LLM tasks in parallel ─────────────────────────────────────
    //    ✅ FIX: Promise.allSettled instead of Promise.all
    //    Previously: ONE failing LLM call killed ALL three → blank results
    //    Now: each task can fail independently, we return what succeeded
    const [readmeResult, advancedDiagramResult, outreachResult] = await Promise.allSettled([
      withTimeout(
        generateReadme({
          repoName:     analysis.metadata.name,
          description:  analysis.metadata.description ?? '',
          languages,
          topics:       analysis.metadata.topics,
          stars:        analysis.metadata.stars,
          forks:        analysis.metadata.forks,
          architecture,
          contributors: analysis.existingContributors,
          userAnswers,
        }),
        45_000,
        'generateReadme'
      ),
      withTimeout(
        generateAdvancedDiagram({
          repoName:  analysis.metadata.name,
          languages,
          topics:    analysis.metadata.topics,
          architecture,
          userAnswers,
        }),
        45_000,
        'generateAdvancedDiagram'
      ),
      withTimeout(
        generateContributorOutreach({
          repoName:              analysis.metadata.name,
          description:           analysis.metadata.description ?? '',
          languages,
          topics:                analysis.metadata.topics,
          architecture,
          potentialContributors,
          userAnswers,
        }),
        45_000,
        'generateContributorOutreach'
      ),
    ]);

    // Log any individual failures (non-fatal)
    if (readmeResult.status === 'rejected')
      console.error(`[${requestId}] generateReadme failed:`, readmeResult.reason);
    if (advancedDiagramResult.status === 'rejected')
      console.error(`[${requestId}] generateAdvancedDiagram failed:`, advancedDiagramResult.reason);
    if (outreachResult.status === 'rejected')
      console.error(`[${requestId}] generateContributorOutreach failed:`, outreachResult.reason);

    // Extract values — null means that specific task failed
    const readme          = readmeResult.status          === 'fulfilled' ? readmeResult.value          : null;
    const advancedDiagram = advancedDiagramResult.status === 'fulfilled' ? advancedDiagramResult.value  : null;
    const outreach        = outreachResult.status        === 'fulfilled' ? outreachResult.value         : null;

    // ── 8. Return response ───────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      requestId,
      data: {
        metadata:             analysis.metadata,
        languages:            analysis.languages,
        existingContributors: analysis.existingContributors,
        potentialContributors,
        contributorEmails:    outreach?.emails ?? [],
        architecture,
        simpleDiagram,                        // ← always a string (rule-based, never null)
        advancedDiagram: advancedDiagram ?? simpleDiagram, // ← ✅ fallback to simpleDiagram if LLM failed
        readme:          readme ?? '',        // ← empty string instead of null
      },
      // Tells frontend which tasks failed so it can show partial-success UI
      warnings: {
        readmeFailed:          readmeResult.status          === 'rejected',
        advancedDiagramFailed: advancedDiagramResult.status === 'rejected',
        outreachFailed:        outreachResult.status        === 'rejected',
      },
    });

  } catch (error) {
    console.error(`[${requestId}] Unhandled error:`, error);

    if (error instanceof ValidationError)
      return NextResponse.json({ success: false, error: error.message, requestId }, { status: 400 });
    if (error instanceof NotFoundError)
      return NextResponse.json({ success: false, error: error.message, requestId }, { status: 404 });
    if (error instanceof RateLimitError)
      return NextResponse.json({ success: false, error: error.message, requestId }, { status: 429 });

    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return NextResponse.json({ success: false, error: message, requestId }, { status: 500 });
  }
}