import { z } from 'zod';
import { getLatestCompletedAnalysis, getRecentSyncJobs, getRepoById } from '@/lib/db-service';
import { retrieveRelevantChunks } from '@/lib/retrieval';
import { fetchRepoContents } from '@/lib/github-ingest';

export const searchCodeSchema = z.object({
  query: z.string().min(1),
});

export const readFileSchema = z.object({
  filePath: z.string().min(1),
});

export const getDependencyGraphSchema = z.object({});
export const getGitDiffSchema = z.object({});
export const retrieveChunksSchema = z.object({
  query: z.string().min(1),
});

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'search_code',
    description: 'Search repository source files for code snippets, symbols, or file paths.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term or symbol name' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a specific file in the repository.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Relative file path in repository (e.g. lib/auth.ts)' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'get_dependency_graph',
    description: 'Get the deterministic static architecture and module dependency graph.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_git_diff',
    description: 'Get recent commit history and changed files in the repository.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'retrieve_relevant_chunks',
    description: 'Retrieve semantically relevant repository chunks using pgvector similarity search.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Semantic query to find relevant code context' },
      },
      required: ['query'],
    },
  },
];

export async function executeTool(
  repoId: string,
  toolName: string,
  args: unknown,
  accessToken: string
): Promise<string> {
  const analysis = await getLatestCompletedAnalysis(repoId);
  if (!analysis) {
    return JSON.stringify({ error: 'No completed analysis available for this repository.' });
  }

  try {
    switch (toolName) {
      case 'search_code': {
        const { query } = searchCodeSchema.parse(args);
        const chunks = await retrieveRelevantChunks(repoId, query, 6);
        const matches = chunks.map((c) => ({
          filePath: c.file_path,
          snippet: c.content.slice(0, 300),
          similarity: c.similarity,
        }));
        return JSON.stringify({ matches });
      }

      case 'read_file': {
        const { filePath } = readFileSchema.parse(args);
        // Security check: prevent path traversal
        const normalized = filePath.replace(/\\/g, '/').replace(/^\//, '');
        if (normalized.includes('..') || normalized.startsWith('.')) {
          return JSON.stringify({ error: 'Access denied: path traversal not permitted.' });
        }

        // Fetch file content using repo analysis or GitHub ingest helper
        const archData = (analysis.architecture_data as Record<string, unknown>) || {};
        const modules = (archData.modules as Array<{ path: string }>) || [];
        const fileExists = modules.some((m) => m.path === normalized || m.path.endsWith('/' + normalized));

        if (!fileExists) {
          return JSON.stringify({ error: `File '${normalized}' not found in analyzed codebase.` });
        }

        const repoRecord = await getRepoById(repoId);
        const [owner, repoName] = repoRecord ? repoRecord.full_name.split('/') : [];
        let fileContent = '';

        if (owner && repoName && accessToken) {
          try {
            const fetched = await fetchRepoContents(
              accessToken,
              owner,
              repoName,
              repoRecord!.default_branch
            );
            const targetFile = fetched.files.find((f) => f.path === normalized);
            if (targetFile) fileContent = targetFile.content;
          } catch (fetchErr) {
            console.error('[agent-tools:read_file] GitHub fetch failed:', fetchErr);
            // fall through to analysis-derived preview below
          }
        }

        if (!fileContent) {
          fileContent = `[File content preview for ${normalized} from analysis version ${analysis.id.substring(0, 7)}]`;
        }

        return JSON.stringify({
          filePath: normalized,
          content: fileContent.slice(0, 3000), // Bounded file content
          truncated: fileContent.length > 3000,
        });
      }

      case 'get_dependency_graph': {
        getDependencyGraphSchema.parse(args);
        const archData = (analysis.architecture_data as Record<string, unknown>) || {};
        const mermaid = analysis.mermaid_diagram || '';
        return JSON.stringify({
          commitSha: analysis.commit_sha,
          modulesCount: ((archData.modules as unknown[]) || []).length,
          mermaidDiagram: mermaid,
          externalDependencies: archData.externalDependencies || [],
        });
      }

      case 'get_git_diff': {
        getGitDiffSchema.parse(args);
        const recentJobs = await getRecentSyncJobs(repoId, 3);
        const syncHistory = recentJobs.map((j) => ({
          commitSha: j.commit_sha,
          eventType: j.event_type,
          changedFiles: j.changed_files,
          createdAt: j.created_at,
        }));
        return JSON.stringify({
          latestAnalyzedCommit: analysis.commit_sha,
          recentSyncEvents: syncHistory,
        });
      }

      case 'retrieve_relevant_chunks': {
        const { query } = retrieveChunksSchema.parse(args);
        const chunks = await retrieveRelevantChunks(repoId, query, 5);
        return JSON.stringify({
          chunks: chunks.map((c) => ({
            filePath: c.file_path,
            chunkIndex: c.chunk_index,
            content: c.content,
          })),
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool '${toolName}'` });
    }
  } catch (err: unknown) {
    const error = err as Error;
    return JSON.stringify({ error: `Tool execution error: ${error.message}` });
  }
}