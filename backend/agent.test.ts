import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createAgentHandler } from "./agent";

const originalFetch = globalThis.fetch;
const originalKey = process.env.LUMINAL_API_KEY;
let saved: any[];
let handler: ReturnType<typeof createAgentHandler>;
const source = {
  id: "sample-1",
  title: "Sample policy",
  isDemo: true,
  status: "published",
  content: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Acknowledge gifts promptly." }],
      },
    ],
  },
};
const doc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Review this suggested draft [sample-1]." },
      ],
    },
  ],
};
const request = (overrides: Record<string, unknown> = {}) =>
  new Request("http://localhost/api/agent", {
    method: "POST",
    body: JSON.stringify({
      mode: "ask",
      messages: [{ role: "user", content: "Help with stewardship" }],
      ...overrides,
    }),
  });
function model(result: unknown) {
  globalThis.fetch = (async () =>
    Response.json({
      choices: [
        {
          message: {
            content:
              typeof result === "string" ? result : JSON.stringify(result),
          },
        },
      ],
    })) as unknown as typeof fetch;
}

// Tests intentionally run sequentially: fetch and environment belong to the process.
describe("server-side agent safety and persistence contract", () => {
  beforeEach(() => {
    process.env.LUMINAL_API_KEY = "test-only-provider-secret";
    saved = [];
    handler = createAgentHandler({
      bootstrap: async () => ({ articles: [source] }),
      saveDraft: async (input) => {
        saved.push(input);
        return { ...input, id: input.id || "new-draft" };
      },
    });
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.LUMINAL_API_KEY;
    else process.env.LUMINAL_API_KEY = originalKey;
  });

  test("missing provider configuration returns 503 without calling provider", async () => {
    delete process.env.LUMINAL_API_KEY;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("Unexpected provider call");
    }) as unknown as typeof fetch;
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(((await response.json()) as any).code).toBe("AI_NOT_CONFIGURED");
    expect(called).toBe(false);
    expect(saved).toHaveLength(0);
  });

  test("rejects malformed model JSON without saving a draft", async () => {
    model("not valid JSON");
    const response = await handler(request({ mode: "draft" }));
    expect(response.status).toBe(502);
    expect(saved).toHaveLength(0);
  });

  test("repairs malformed JSON once and converts simple sections to valid rich text", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return Response.json({
        choices: [
          {
            message: {
              content:
                calls === 1
                  ? "invalid JSON"
                  : JSON.stringify({
                      message: "Draft ready",
                      sourceIds: ["sample-1"],
                      draft: {
                        title: "SOP",
                        sections: [
                          {
                            heading: "Steps",
                            steps: [
                              "Record gift [sample-1]",
                              "Review acknowledgment",
                            ],
                          },
                          {
                            heading: "Review questions",
                            paragraphs: ["Who owns follow-up?"],
                          },
                        ],
                      },
                    }),
            },
          },
        ],
      });
    }) as unknown as typeof fetch;
    const response = await handler(request({ mode: "draft" }));
    expect(response.status).toBe(200);
    expect(calls).toBe(2);
    expect(saved).toHaveLength(1);
    expect(saved[0].content.type).toBe("doc");
    expect(saved[0].content.content[1].type).toBe("orderedList");
    expect(saved[0].status).toBe("draft");
  });

  test("malformed response repair is bounded to two total requests", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return Response.json({
        choices: [{ message: { content: "malformed" } }],
      });
    }) as unknown as typeof fetch;
    const response = await handler(request({ mode: "draft" }));
    expect(response.status).toBe(502);
    expect(calls).toBe(2);
    expect(saved).toHaveLength(0);
  });

  test("rejects model citations that do not identify supplied evidence", async () => {
    model({
      message: "Unsupported claim",
      sourceIds: ["invented-source"],
      draft: { title: "SOP", content: doc },
    });
    const response = await handler(request({ mode: "draft" }));
    expect(response.status).toBe(502);
    expect(((await response.json()) as any).error).toContain("citations");
    expect(saved).toHaveLength(0);
  });

  test("selected private text requires explicit consent before provider call", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("Unexpected provider call");
    }) as unknown as typeof fetch;
    const response = await handler(
      request({
        sources: [
          { id: "upload-1", title: "Staff note", text: "Private content" },
        ],
      }),
    );
    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });

  test("consented source can be cited and text is omitted from response", async () => {
    let upstream = "";
    globalThis.fetch = (async (_url: unknown, init: any) => {
      upstream = init.body;
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                message: "Based on selected staff note [upload-1]",
                sourceIds: ["upload-1"],
              }),
            },
          },
        ],
      });
    }) as unknown as typeof fetch;
    const response = await handler(
      request({
        sourcesConsent: true,
        sources: [
          {
            id: "upload-1",
            title: "Staff note",
            text: "Private exact sentence",
          },
        ],
      }),
    );
    expect(response.status).toBe(200);
    expect(upstream).toContain("Private exact sentence");
    const body = (await response.json()) as any;
    expect(body.sources[0].id).toBe("upload-1");
    expect(JSON.stringify(body)).not.toContain("Private exact sentence");
    expect(saved).toHaveLength(0);
  });

  test("draft mode overrides attempted publication and saves only draft", async () => {
    model({
      message: "Draft ready for review",
      sourceIds: ["sample-1"],
      draft: {
        title: "Gift acknowledgment",
        content: doc,
        status: "published",
      },
    });
    const response = await handler(
      request({ mode: "draft", articleId: "sample-1" }),
    );
    expect(response.status).toBe(200);
    expect(saved).toHaveLength(1);
    expect(saved[0].status).toBe("draft");
    expect(saved[0].id).toBe("sample-1");
    expect(saved[0].sources[0].id).toBe("sample-1");
    expect(saved[0].sources[0].title).toBe("Sample policy");
    expect(saved[0].sources[0].synthetic).toBe(true);
    expect(saved[0].sources[0].text).toBeUndefined();
    expect(((await response.json()) as any).draft.status).toBe("draft");
  });

  test("rejects unsafe rich-text link before saving", async () => {
    const unsafe = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Click",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    };
    model({
      message: "Draft",
      sourceIds: [],
      draft: { title: "Unsafe", content: unsafe },
    });
    expect((await handler(request({ mode: "draft" }))).status).toBe(502);
    expect(saved).toHaveLength(0);
  });

  test("upstream body and credentials never appear in errors", async () => {
    globalThis.fetch = (async () =>
      new Response("test-only-provider-secret private upstream diagnostics", {
        status: 401,
      })) as unknown as typeof fetch;
    const response = await handler(request());
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).not.toContain("test-only-provider-secret");
    expect(body).not.toContain("private upstream diagnostics");
    expect(saved).toHaveLength(0);
  });

  test("general Ask sees published snapshot instead of pending edits", async () => {
    let prompt = "";
    const article = {
      ...source,
      status: "draft",
      title: "Unreviewed title",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Unreviewed secret edit" }],
          },
        ],
      },
      publishedTitle: "Approved title",
      publishedContent: source.content,
    };
    handler = createAgentHandler({
      bootstrap: async () => ({ articles: [article] }),
      saveDraft: async (input) => input,
    });
    globalThis.fetch = (async (_url: unknown, init: any) => {
      prompt = JSON.parse(init.body).messages[0].content;
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                message: "Approved guidance [sample-1]",
                sourceIds: ["sample-1"],
              }),
            },
          },
        ],
      });
    }) as unknown as typeof fetch;
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(prompt).toContain("Acknowledge gifts promptly.");
    expect(prompt).toContain("Approved title");
    expect(prompt).not.toContain("Unreviewed secret edit");
    expect(((await response.json()) as any).sources[0].status).toBe(
      "published snapshot",
    );
    const selectedResponse = await handler(request({ articleId: "sample-1" }));
    expect(selectedResponse.status).toBe(200);
    expect(prompt).toContain("Unreviewed secret edit");
    expect(prompt).toContain('"selectedDraft":true');
    expect(prompt).not.toContain("Acknowledge gifts promptly.");
  });

  test("file discovery sends bounded metadata, excludes contents, and resolves original links", async () => {
    let prompt = "";
    handler = createAgentHandler({
      bootstrap: async () => ({
        articles: [],
        files: [
          {
            id: "drive-budget",
            name: "Budget.xlsx",
            provider: "Google Drive",
            orgflowPath: "Finance/Budget.xlsx",
            url: "https://drive.google.com/file/d/budget/view",
            synthetic: false,
            content: "Never send cached file body automatically",
          },
        ],
      }),
      saveDraft: async (input) => input,
    });
    globalThis.fetch = (async (_url: unknown, init: any) => {
      prompt = JSON.parse(init.body).messages[0].content;
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                message: "Find Budget.xlsx in Finance [drive-budget]",
                sourceIds: ["drive-budget"],
              }),
            },
          },
        ],
      });
    }) as unknown as typeof fetch;
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(prompt).toContain("Finance/Budget.xlsx");
    expect(prompt).toContain(
      "Metadata does not support ANY claim about file contents",
    );
    expect(prompt).not.toContain("Never send cached file body automatically");
    const body = (await response.json()) as any;
    expect(body.sources[0].sourceType).toBe("file metadata");
    expect(body.sources[0].url).toBe(
      "https://drive.google.com/file/d/budget/view",
    );
    expect(body.sources[0].provider).toBe("Google Drive");
  });
});
