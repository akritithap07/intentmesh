import crypto from 'crypto';
import { FileContent } from '@/lib/github-ingest';

export interface FileChunk {
  file_path: string;
  chunk_index: number;
  content: string;
  content_hash: string;
}

export function chunkFiles(files: FileContent[], maxChunkSize = 1500): FileChunk[] {
  const chunks: FileChunk[] = [];

  for (const file of files) {
    const text = file.content;
    if (!text || text.trim().length === 0) continue;

    // Split text into logical chunks (by double line breaks or line blocks)
    const blocks = text.split(/\n\s*\n/);
    let currentChunk = '';
    let chunkIndex = 0;

    for (const block of blocks) {
      if ((currentChunk + '\n\n' + block).length > maxChunkSize && currentChunk.trim().length > 0) {
        const trimmed = currentChunk.trim();
        const content_hash = crypto
          .createHash('sha256')
          .update(`${file.path}:${chunkIndex}:${trimmed}`)
          .digest('hex');

        chunks.push({
          file_path: file.path,
          chunk_index: chunkIndex,
          content: trimmed,
          content_hash,
        });

        chunkIndex++;
        currentChunk = block;
      } else {
        currentChunk = currentChunk ? `${currentChunk}\n\n${block}` : block;
      }
    }

    if (currentChunk.trim().length > 0) {
      const trimmed = currentChunk.trim();
      const content_hash = crypto
        .createHash('sha256')
        .update(`${file.path}:${chunkIndex}:${trimmed}`)
        .digest('hex');

      chunks.push({
        file_path: file.path,
        chunk_index: chunkIndex,
        content: trimmed,
        content_hash,
      });
    }
  }

  return chunks;
}
