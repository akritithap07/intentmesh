import { db } from '@/lib/db';
import { repoChunks, RepoChunk } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { FileContent } from '@/lib/github-ingest';
import { chunkFiles } from '@/lib/chunker';
import { generateEmbedding, computeCosineSimilarity } from '@/lib/embedding';

export interface ContextChunk {
  file_path: string;
  chunk_index: number;
  content: string;
  similarity: number;
}

export async function indexRepositoryChunks(
  repoId: string,
  analysisId: string,
  files: FileContent[]
): Promise<number> {
  const chunks = chunkFiles(files);
  if (chunks.length === 0) return 0;

  // 1. Delete previous chunks for this repo/analysis to prevent duplicates
  await db.delete(repoChunks).where(eq(repoChunks.repo_id, repoId));

  // 2. Generate embeddings and insert into repo_chunks table
  const recordsToInsert = [];
  for (const c of chunks) {
    const embedding = await generateEmbedding(c.content);
    recordsToInsert.push({
      repo_id: repoId,
      analysis_id: analysisId,
      file_path: c.file_path,
      chunk_index: c.chunk_index,
      content: c.content,
      content_hash: c.content_hash,
      embedding,
    });
  }

  // Batch insert into db
  if (recordsToInsert.length > 0) {
    await db.insert(repoChunks).values(recordsToInsert);
  }

  console.log(`[Indexing] Successfully indexed ${recordsToInsert.length} chunks for repo ${repoId}`);
  return recordsToInsert.length;
}

export async function retrieveRelevantChunks(
  repoId: string,
  query: string,
  topK = 5
): Promise<ContextChunk[]> {
  // 1. Fetch chunks STRICTLY belonging to repo_id
  const chunksInDb: RepoChunk[] = await db
    .select()
    .from(repoChunks)
    .where(eq(repoChunks.repo_id, repoId));

  if (chunksInDb.length === 0) {
    return [];
  }

  // 2. Generate embedding for user query
  const queryEmbedding = await generateEmbedding(query);

  // 3. Compute cosine similarity for each chunk
  const scoredChunks = chunksInDb.map((c) => {
    let similarity = 0;
    if (c.embedding && Array.isArray(c.embedding)) {
      similarity = computeCosineSimilarity(queryEmbedding, c.embedding as number[]);
    } else {
      // Fallback simple term matching score if embedding missing
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const textLower = c.content.toLowerCase();
      let matches = 0;
      for (const t of terms) {
        if (textLower.includes(t)) matches++;
      }
      similarity = matches / (terms.length || 1);
    }

    return {
      file_path: c.file_path,
      chunk_index: c.chunk_index,
      content: c.content,
      similarity,
    };
  });

  // 4. Sort descending by similarity score and pick topK
  scoredChunks.sort((a, b) => b.similarity - a.similarity);
  return scoredChunks.slice(0, topK);
}
