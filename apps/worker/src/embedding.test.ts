import { describe, expect, it } from "vitest";
import { createVectorIndex } from "./embedding";
import type { FlareMoEnv } from "./env";

/**
 * Regression guard for the Vectorize binding contract: the runtime serializes
 * the query options verbatim, and `returnMetadata: false` is rejected with
 * `VECTOR_QUERY_ERROR (40026) — expected value`. Only the string levels are
 * accepted, so the adapter must send `"none"`.
 */
describe("CloudflareVectorIndex.query", () => {
  it("sends a string returnMetadata level plus the namespace", async () => {
    const calls: Array<{ vector: number[]; options: Record<string, unknown> }> =
      [];
    const binding = {
      query: async (vector: number[], options: Record<string, unknown>) => {
        calls.push({ vector, options });
        return { count: 1, matches: [{ id: "memos/a#chunks/0", score: 0.5 }] };
      },
    };
    const index = createVectorIndex(
      { VECTORIZE_MEMOS: binding } as unknown as FlareMoEnv,
      "memo",
    );

    const hits = await index?.query([0.1, 0.2], 5, "user:users/owner");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.options).toEqual({
      topK: 5,
      returnMetadata: "none",
      namespace: "user:users/owner",
    });
    expect(hits).toEqual([{ id: "memos/a#chunks/0", score: 0.5 }]);
  });

  it("omits the namespace option when none is given", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const binding = {
      query: async (_vector: number[], options: Record<string, unknown>) => {
        calls.push(options);
        return { count: 0, matches: [] };
      },
    };
    const index = createVectorIndex(
      { VECTORIZE_MEMOS: binding } as unknown as FlareMoEnv,
      "memo",
    );

    await index?.query([0.1], 3);

    expect(calls[0]).toEqual({ topK: 3, returnMetadata: "none" });
  });
});
