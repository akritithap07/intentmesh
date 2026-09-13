import { Octokit } from 'octokit';

export interface GithubRepoInfo {
  id: number;
  full_name: string;
  name: string;
  owner: string;
  default_branch: string;
  private: boolean;
  description: string | null;
  installation_id: number;
}

export function getOctokit(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken });
}

export async function getAuthenticatedGithubUser(accessToken: string) {
  const octokit = getOctokit(accessToken);
  const { data } = await octokit.rest.users.getAuthenticated();
  return {
    id: data.id,
    login: data.login,
    name: data.name ?? null,
    email: data.email ?? null,
    avatar_url: data.avatar_url ?? null,
  };
}

export async function getUserAvailableRepos(accessToken: string): Promise<GithubRepoInfo[]> {
  const octokit = getOctokit(accessToken);
  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    sort: 'updated',
    per_page: 100,
  });

  return data.map((repo) => ({
    id: repo.id,
    full_name: repo.full_name,
    name: repo.name,
    owner: repo.owner.login,
    default_branch: repo.default_branch || 'main',
    private: repo.private,
    description: repo.description,
    installation_id: 1, // Fallback default installation_id if GitHub App is not configured
  }));
}

export async function getRepoDetails(accessToken: string, owner: string, repo: string): Promise<GithubRepoInfo> {
  const octokit = getOctokit(accessToken);
  const { data } = await octokit.rest.repos.get({ owner, repo });

  return {
    id: data.id,
    full_name: data.full_name,
    name: data.name,
    owner: data.owner.login,
    default_branch: data.default_branch || 'main',
    private: data.private,
    description: data.description,
    installation_id: 1,
  };
}
