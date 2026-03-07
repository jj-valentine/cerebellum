import { cfg } from './config.js';

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.openrouter.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.openrouter.embeddingModel,
      input: text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Embedding request failed (${response.status}): ${body}`);
  }

  const json = await response.json() as { data: Array<{ embedding: number[] }> };
  if (!json.data || json.data.length === 0) {
    throw new Error(`Embeddings API returned empty data (status: ${response.status})`);
  }
  return json.data[0].embedding;
}
