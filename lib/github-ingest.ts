import { getOctokit } from '@/lib/github';

export interface FileContent {
  path: string;
  content: string;
}

const SUPPORTED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.md', '.yml', '.yaml']);
const IGNORED_PATHS = ['node_modules/', '.git/', 'dist/', 'build/', '.next/', 'out/', 'coverage/'];

export async function fetchRepoContents(
  accessToken: string,
  owner: string,
  repo: string,
  defaultBranch: string
): Promise<{ commitSha: string; files: FileContent[] }> {
  const octokit = getOctokit(accessToken);

  // 1. Get latest commit SHA for the target branch
  const { data: branchData } = await octokit.rest.repos.getBranch({
    owner,
    repo,
    branch: defaultBranch,
  });
  const commitSha = branchData.commit.sha;

  // 2. Get recursive tree for the commit
  const { data: treeData } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: commitSha,
    recursive: 'true',
  });

  // 3. Filter tree items
  const validItems = (treeData.tree || []).filter((item) => {
    if (item.type !== 'blob' || !item.path) return false;
    const path = item.path;

    // Check ignored directories
    if (IGNORED_PATHS.some((ignored) => path.startsWith(ignored) || path.includes('/' + ignored))) {
      return false;
    }

    // Check supported file extensions
    const ext = '.' + path.split('.').pop()?.toLowerCase();
    return SUPPORTED_EXTENSIONS.has(ext);
  });

  // Limit max files fetched per job to stay within safe bounds (e.g. max 50 source files)
  const itemsToFetch = validItems.slice(0, 50);

  // 4. Fetch content for selected files
  const files: FileContent[] = [];
  for (const item of itemsToFetch) {
    if (!item.path) continue;
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: item.path,
        ref: commitSha,
      });

      if ('content' in data && typeof data.content === 'string') {
        const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
        files.push({
          path: item.path,
          content: decoded,
        });
      }
    } catch (err) {
      console.warn(`Failed to fetch content for file ${item.path}:`, err);
    }
  }

  return { commitSha, files };
}
