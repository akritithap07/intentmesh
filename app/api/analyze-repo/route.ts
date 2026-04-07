import { NextRequest, NextResponse } from 'next/server';
import {
  parseGitHubUrl,
  analyzeRepository,
  findPotentialContributors,
  PotentialContributor
} from '@/services/githubService';
import { inferArchitecture } from '@/services/architectureEngine';
import { generateMermaidDiagram } from '@/services/diagramEngine';
import {
  generateReadme,
  generateAdvancedDiagram,
  generateContributorOutreach,
  UserAnswers,
} from '@/services/llmService';

// ─── SECURITY: Rate Limiter ───────────────────────────────────────
const RATE_LIMIT = new Map();

function rateLimit(ip: string) {
  const now = Date.now();
  const window = 60 * 1000;
  const max = 10;

  if (!RATE_LIMIT.has(ip)) RATE_LIMIT.set(ip, []);

  const timestamps = RATE_LIMIT.get(ip).filter((t: number) => now - t < window);

  if (timestamps.length >= max) return false;

  timestamps.push(now);
  RATE_LIMIT.set(ip, timestamps);
  return true;
}

// ─── SECURITY: Input Sanitization ─────────────────────────────────
function sanitizeInput(input: string) {
  return input.replace(/[<>$;]/g, '');
}

// ─── PERFORMANCE: Simple Cache ───────────────────────────────────
const cache = new Map();

function getCache(key: string) {
  const item = cache.get(key);
  if (!item) return null;

  if (Date.now() > item.expiry) {
    cache.delete(key);
    return null;
  }

  return item.data;
}

function setCache(key: string, data: any) {
  cache.set(key, {
    data,
    expiry: Date.now() + 5 * 60 * 1000,
  });
}

// ─── LLM Usage Tracker (Soft Limit) ─────────────────────────────
let llmCallCount = 0;
const WARNING_LIMIT = 30;

function trackLLMUsage(requestId: string, calls: number = 1) {
  llmCallCount += calls;

  if (llmCallCount > WARNING_LIMIT) {
    console.warn(`[${requestId}] ⚠️ High LLM usage: ${llmCallCount}`);
  }
}

// ─── Custom Errors ────────────────────────────────────────────────
class ValidationError extends Error {}
class NotFoundError extends Error {}
class RateLimitError extends Error {}

// ─── Input Validation ─────────────────────────────────────────────
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
    url: url.trim(),
    accessToken: typeof accessToken === 'string' ? accessToken.trim() : '',
    userAnswers: userAnswers as UserAnswers | undefined,
  };
}

// ─── Timeout Wrapper ──────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[Timeout] ${label} exceeded ${ms}ms`)), ms)
    ),
  ]);
}

// ─── MAIN HANDLER ────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    if (!rateLimit(ip)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      throw new ValidationError('Request body is not valid JSON.');
    }

    let { url, accessToken, userAnswers } = validateBody(rawBody);
    url = sanitizeInput(url);

    let owner: string, repo: string;
    try {
      ({ owner, repo } = parseGitHubUrl(url));
    } catch {
      throw new ValidationError('Invalid GitHub URL format.');
    }

    const cacheKey = `${owner}/${repo}`;
    const cached = getCache(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    console.info(`[${requestId}] Analyzing ${owner}/${repo}`);

    let analysis;
    try {
      analysis = await withTimeout(
        analyzeRepository(owner, repo, accessToken),
        15000,
        'analyzeRepository'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404')) throw new NotFoundError('Repository not found');
      if (msg.includes('403')) throw new RateLimitError('GitHub rate limit exceeded');
      if (msg.includes('401')) throw new ValidationError('Invalid GitHub token');
      throw err;
    }

    const languages = Object.keys(analysis.languages);

    const architecture = inferArchitecture(
      analysis.languages,
      analysis.metadata.topics,
      userAnswers?.techStack
    );

    const simpleDiagram = generateMermaidDiagram(architecture);

    let potentialContributors: PotentialContributor[] = [];
    try {
      potentialContributors = await withTimeout<PotentialContributor[]>(
        findPotentialContributors(
          languages,
          analysis.metadata.topics,
          analysis.existingContributors.map(c => c.username),
          accessToken
        ),
        10000,
        'contributors'
      );
    } catch {}

    // 🔥 LLM usage tracking (3 calls)
    trackLLMUsage(requestId, 3);

    const [readmeResult, diagramResult, outreachResult] = await Promise.allSettled([
      generateReadme({
        repoName: analysis.metadata.name,
        description: analysis.metadata.description ?? '',
        languages,
        topics: analysis.metadata.topics,
        stars: analysis.metadata.stars,
        forks: analysis.metadata.forks,
        architecture,
        contributors: analysis.existingContributors,
        userAnswers,
      }),
      generateAdvancedDiagram({
        repoName: analysis.metadata.name,
        languages,
        topics: analysis.metadata.topics,
        architecture,
        userAnswers,
      }),
      generateContributorOutreach({
        repoName: analysis.metadata.name,
        description: analysis.metadata.description ?? '',
        languages,
        topics: analysis.metadata.topics,
        architecture,
        potentialContributors,
        userAnswers,
      }),
    ]);

    const responseData = {
      success: true,
      requestId,
      data: {
        metadata: analysis.metadata,
        languages: analysis.languages,
        existingContributors: analysis.existingContributors,
        potentialContributors,
        contributorEmails: outreachResult.status === 'fulfilled' ? outreachResult.value?.emails ?? [] : [],
        architecture,
        simpleDiagram,
        advancedDiagram: diagramResult.status === 'fulfilled' ? diagramResult.value : simpleDiagram,
        readme: readmeResult.status === 'fulfilled' ? readmeResult.value : '',
      },
    };

    setCache(cacheKey, responseData);

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });

  } catch (error) {
    console.error(`[${requestId}] ERROR:`, error);

    if (error instanceof ValidationError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof NotFoundError)
      return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof RateLimitError)
      return NextResponse.json({ error: error.message }, { status: 429 });

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}