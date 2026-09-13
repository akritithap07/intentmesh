import crypto from 'crypto';

export async function generateEmbedding(text: string, dimensions = 1536): Promise<number[]> {
  // If external OpenAI API key is set, use OpenAI embeddings
  const apiKey = process.env.OPENAI_API_KEY || process.env.EMBEDDING_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text.slice(0, 8000),
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data && json.data[0] && json.data[0].embedding) {
          return json.data[0].embedding;
        }
      }
    } catch (err) {
      console.warn('[Embedding] Remote API call failed, using deterministic feature vectorizer:', err);
    }
  }

  // Deterministic local feature hashing vectorizer (normalized 1536-dim embedding)
  const vector = new Float64Array(dimensions);
  const normalizedText = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const tokens = normalizedText.split(/\s+/).filter(Boolean);

  // Subword / n-gram feature hashing into fixed dimensional space
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    // Hash token
    const hash1 = crypto.createHash('md5').update(token).digest();
    const idx1 = Math.abs(hash1.readInt32BE(0)) % dimensions;
    const sign1 = hash1[4] % 2 === 0 ? 1 : -1;
    vector[idx1] += sign1;

    // Hash bi-grams for local context
    if (i < tokens.length - 1) {
      const bigram = `${token}_${tokens[i + 1]}`;
      const hash2 = crypto.createHash('sha256').update(bigram).digest();
      const idx2 = Math.abs(hash2.readInt32BE(0)) % dimensions;
      const sign2 = hash2[4] % 2 === 0 ? 1 : -1;
      vector[idx2] += sign2 * 1.5;
    }
  }

  // Compute L2 norm
  let sumSq = 0;
  for (let i = 0; i < dimensions; i++) {
    sumSq += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSq) || 1;

  // L2 normalize
  const result: number[] = new Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    result[i] = vector[i] / norm;
  }

  return result;
}

export function computeCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}
