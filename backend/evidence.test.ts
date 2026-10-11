import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createAgentHandler } from "./agent";
import { parseEvidence, quoteAppears } from "./evidence";

test("quote verification requires verbatim text but tolerates case, punctuation and ellipses", () => {
  const source =
    "Staff must send a personal thank-you letter within two working days.\nThe Director signs every letter over $1,000.";
  expect(quoteAppears("send a personal thank-you letter within two working days", source)).toBe(true);
  expect(quoteAppears("SEND a personal thank you letter, within two working days!", source)).toBe(true);
  expect(quoteAppears("send a personal … within two working days", source)).toBe(true);
  expect(quoteAppears("send an email receipt within one day", source)).toBe(false);
  expect(quoteAppears("short", source)).toBe(false);
  const evidence = parseEvidence(
    [
      { sourceId: "a", quote: "personal thank-you letter within two working days", supports: "timing" },
      { sourceId: "a", quote: "within five working days", supports: "timing" },
      { sourceId: "ghost", quote: "anything at all here", supports: "x" },
      { nope: true },
    ],
    [{ id: "a", title: "Policy", text: source }],
  );
  expect(evidence.map((e) => e.verified)).toEqual([true, false, false]);
});

describe("agent returns verified evidence and persists it on drafts", () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.LUMINAL_API_KEY;
  beforeEach(() => {
    process.env.LUMINAL_API_KEY = "test-only-provider-secret";
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.LUMINAL_API_KEY;
    else process.env.LUMINAL_API_KEY = originalKey;
  });
  const model = (result: unknown) => {
    globalThis.fetch = (async () =>
      Response.json({ choices: [{ message: { content: JSON.stringify(result) } }] })) as unknown as typeof fetch;
  };
  const text = "Gifts are acknowledged with a handwritten note within two working days.";
  const request = (mode: string) =>
    new Request("http://localhost/api/agent", {
      method: "POST",
      body: JSON.stringify({
        mode,
        messages: [{ role: "user", content: "How do we thank donors?" }],
        sourcesConsent: true,
        sources: [{ id: "upload-1", title: "Notes", text, modifiedTime: "2026-09-01T00:00:00Z" }],
      }),
    });

  test("ask: unverifiable quotes are flagged, not hidden", async () => {
    model({
      message: "Within two days [upload-1]",
      sourceIds: ["upload-1"],
      evidence: [
        { sourceId: "upload-1", quote: "handwritten note within two working days", supports: "timing" },
        { sourceId: "upload-1", quote: "a certified letter within a month", supports: "invented" },
      ],
    });
    const handler = createAgentHandler({ bootstrap: async () => ({ articles: [] }), saveDraft: async (i) => i });
    const body: any = await (await handler(request("ask"))).json();
    expect(body.evidence.map((e: any) => e.verified)).toEqual([true, false]);
    expect(body.grounding).toEqual({ verified: 1, total: 2 });
  });

  test("draft: evidence, conflicts and the captured version are saved with the draft", async () => {
    model({
      message: "Drafted",
      sourceIds: ["upload-1"],
      evidence: [{ sourceId: "upload-1", quote: "handwritten note within two working days", supports: "step 1" }],
      conflicts: [{ topic: "timing", sourceIds: ["upload-1", "ghost"], note: "Two days vs. one week." }],
      draft: {
        title: "Gift acknowledgment",
        sections: [{ heading: "Steps", steps: ["Send a handwritten note within two working days."] }],
      },
    });
    const saved: any[] = [];
    const handler = createAgentHandler({
      bootstrap: async () => ({ articles: [] }),
      saveDraft: async (i) => {
        saved.push(i);
        return { ...i, id: "new" };
      },
    });
    expect((await handler(request("draft"))).status).toBe(200);
    expect(saved[0].evidence[0].verified).toBe(true);
    expect(saved[0].conflicts[0].sourceIds).toEqual(["upload-1"]); // unknown ids dropped
    expect(saved[0].sources[0].modifiedTime).toBe("2026-09-01T00:00:00Z");
    expect(saved[0].sources[0].text).toBeUndefined();
  });
});
