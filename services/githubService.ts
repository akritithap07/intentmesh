// ── Core fetch helper ──────────────────────────────────────────────
async function githubFetch(endpoint: string, userToken?: string): Promise<unknown> {
  const token =
  userToken && userToken.startsWith('ghp_')
    ? userToken
    : process.env.GITHUB_TOKEN;

  // Abort after 10 s — GitHub API should respond fast
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`https://api.github.com${endpoint}`, {
      signal: controller.signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (response.status === 404) throw new Error('Repository not found. Check the URL.');
    if (response.status === 401) throw new Error('Invalid GitHub token. Check your access token.');
    if (response.status === 403) {
      const remaining = response.headers.get('x-ratelimit-remaining');
      if (remaining === '0') throw new Error('GitHub rate limit exceeded. Provide a personal access token or wait.');
      throw new Error('Access denied. The repository may be private.');
    }
    if (!response.ok) throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);

    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Types ─────────────────────────────────────────────────────────
export interface RepoMetadata {
  name: string;
  description: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  defaultBranch: string;
  topics: string[];
  htmlUrl: string;
}

export interface Contributor {
  username: string;
  profileUrl: string;
  avatarUrl: string;
  contributions: number;
}

export interface PotentialContributor {
  username: string;
  profileUrl: string;
  avatarUrl: string;
  bio: string | null;
  publicRepos: number;
  followers: number;
  location: string | null;
  topLanguages: string[];
}

export interface GitHubAnalysis {
  metadata: RepoMetadata;
  languages: Record<string, number>;
  existingContributors: Contributor[];
}

// ── Parse GitHub URL ───────────────────────────────────────────────
export function parseGitHubUrl(url: string): { owner: string; repo: string } {
  const match = url.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  if (!match) throw new Error('Invalid GitHub URL format. Expected: https://github.com/owner/repo');
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

// ── Analyze a repository ───────────────────────────────────────────
export async function analyzeRepository(
  owner: string,
  repo: string,
  userToken?: string,
): Promise<GitHubAnalysis> {
  const [rawMeta, rawLanguages, rawContributors] = await Promise.all([
    githubFetch(`/repos/${owner}/${repo}`, userToken),
    githubFetch(`/repos/${owner}/${repo}/languages`, userToken),
    // Contributors can fail for forks/new repos — handle separately
    githubFetch(`/repos/${owner}/${repo}/contributors?per_page=10`, userToken).catch(() => []),
  ]);

  const meta = rawMeta as {
    name: string; description: string | null; stargazers_count: number;
    forks_count: number; open_issues_count: number; default_branch: string;
    topics: string[]; html_url: string;
  };

  const contributors = (
    Array.isArray(rawContributors)
      ? rawContributors as { login: string; html_url: string; avatar_url: string; contributions: number }[]
      : []
  ).map(c => ({
    username:      c.login,
    profileUrl:    c.html_url,
    avatarUrl:     c.avatar_url,
    contributions: c.contributions,
  }));

  return {
    metadata: {
      name:          meta.name,
      description:   meta.description,
      stars:         meta.stargazers_count,
      forks:         meta.forks_count,
      openIssues:    meta.open_issues_count,
      defaultBranch: meta.default_branch,
      topics:        meta.topics ?? [],
      htmlUrl:       meta.html_url,
    },
    languages:            rawLanguages as Record<string, number>,
    existingContributors: contributors,
  };
}

// ── Find potential contributors ────────────────────────────────────
export async function findPotentialContributors(
  languages: string[],
  topics: string[],
  existingContributorUsernames: string[],
  userToken?: string,
): Promise<PotentialContributor[]> {
  const token = userToken || process.env.GITHUB_TOKEN;
  const primaryLang = languages[0] ?? 'JavaScript';

  const query = `language:${primaryLang} repos:>5 followers:>10`;

  let searchRes: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    searchRes = await fetch(
      `https://api.github.com/search/users?q=${encodeURIComponent(query)}&sort=repositories&order=desc&per_page=20`,
      {
        signal: controller.signal,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    clearTimeout(timer);
  } catch {
    return []; // Contributor search is non-fatal
  }

  if (!searchRes.ok) return [];

  const searchData = await searchRes.json() as {
    items: { login: string; avatar_url: string; html_url: string }[];
  };

  const filtered = (searchData.items ?? [])
    .filter(u => !existingContributorUsernames.includes(u.login))
    .slice(0, 8);

  if (filtered.length === 0) return [];

  // Fetch full profiles in parallel — each is individually non-fatal
  const profiles = await Promise.allSettled(
    filtered.map(u =>
      fetch(`https://api.github.com/users/${u.login}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Accept: 'application/vnd.github+json',
        },
      }).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))),
    ),
  );

  const result: PotentialContributor[] = [];

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    const u = filtered[i];
    if (p.status !== 'fulfilled') continue;

    const profile = p.value as {
      login: string; bio: string | null; public_repos: number;
      followers: number; location: string | null;
    };

    result.push({
      username:     profile.login,
      profileUrl:   u.html_url,
      avatarUrl:    u.avatar_url,
      bio:          profile.bio,
      publicRepos:  profile.public_repos,
      followers:    profile.followers,
      location:     profile.location,
      topLanguages: [primaryLang],
    });
  }

  return result;
}