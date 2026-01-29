import { getOpenRouterKey, EMBEDDING_MODEL, computeCost, logAPICall } from "../utils/api/openrouter";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/embeddings";

type EmbeddingResponse = {
  data: { embedding: number[] }[];
  usage?: { prompt_tokens?: number; total_tokens?: number };
};

export async function embedText(text: string): Promise<number[]> {
  const start = Date.now();

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenRouterKey()}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[Embedding] API error: ${response.status} - ${error}`);
    throw new Error(`Embedding API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as EmbeddingResponse;
  const durationMs = Date.now() - start;
  const tokens = data.usage?.prompt_tokens || data.usage?.total_tokens || 0;
  const cost = computeCost(EMBEDDING_MODEL, tokens, 0);

  logAPICall({
    type: "Embedding",
    model: EMBEDDING_MODEL,
    inputTokens: tokens,
    outputTokens: 0,
    cost: cost.toFixed(6),
    durationMs,
    extra: { textLength: text.length, dimension: data.data[0]?.embedding.length },
  });

  return data.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const BATCH_SIZE = 20;
  const results: number[][] = [];
  let totalTokens = 0;
  const batchStart = Date.now();

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const start = Date.now();

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getOpenRouterKey()}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Embedding] Batch API error: ${response.status} - ${error}`);
      throw new Error(`Embedding API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as EmbeddingResponse;
    const durationMs = Date.now() - start;
    const tokens = data.usage?.prompt_tokens || data.usage?.total_tokens || 0;
    totalTokens += tokens;

    results.push(...data.data.map((d) => d.embedding));

    console.log(
      `[Embedding] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)}: ` +
      `${batch.length} texts, ${tokens} tokens, ${durationMs}ms`
    );

    if (i + BATCH_SIZE < texts.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const totalDuration = Date.now() - batchStart;
  const cost = computeCost(EMBEDDING_MODEL, totalTokens, 0);

  logAPICall({
    type: "EmbeddingBatch",
    model: EMBEDDING_MODEL,
    inputTokens: totalTokens,
    outputTokens: 0,
    cost: cost.toFixed(6),
    durationMs: totalDuration,
    extra: { totalTexts: texts.length, dimension: results[0]?.length },
  });

  return results;
}
