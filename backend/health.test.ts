import { test, expect } from "bun:test";
import { createMemoryStore, seed } from "./store";
import { createApp } from "./app";
import { changedSources, computeHealth, gapsFor, interviewPlan, outlineSections, sectionsToDoc } from "./health";
import { createGoogleHandler } from "./google";
import { seal, storeVault, unseal } from "./vault";

const NOW = new Date("2026-10-11T12:00:00Z");
const day = (n: number) => new Date(+NOW + n * 86400000).toISOString();
const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const long = "step ".repeat(80);
const article = (over: Record<string, any>) => ({
  id: "a",
  title: "Process",
  categoryId: "c",
  content: doc(long),
  status: "published",
  publishedContent: doc(long),
  publishedAt: day(-10),
  reviewDueAt: day(80),
  updatedAt: day(-10),
  ...over,
});

test("health flags leaving owners, overdue review, orphans, changed sources and unverified quotes", () => {
  const people = [
    { id: "p1", name: "Dana", role: "Development Director", status: "leaving" },
    { id: "p2", name: "Eli", role: "Office Manager", status: "active", successorId: "p1" },
    { id: "p3", name: "Fay", role: "Volunteer Lead", status: "active" },
  ];
  const articles = [
    article({ id: "a1", title: "Gift acknowledgment", ownerId: "p1", reviewDueAt: day(-100) }),
    article({ id: "a2", title: "Supplies", ownerId: "p2" }),
    article({
      id: "a3",
      title: "Orphan",
      sources: [{ id: "drive-1", title: "Letter", modifiedTime: day(-30) }],
      evidence: [{ verified: true }, { verified: false }],
    }),
    { id: "a4", title: "Draft only", status: "draft", content: doc("short"), ownerId: "p3", updatedAt: day(-30) },
  ];
  const health = computeHealth({
    articles,
    people,
    sources: [{ id: "drive-1", updatedAt: day(-1) }],
    now: NOW,
  });
  const by = Object.fromEntries(health.people.map((p) => [p.personId, p]));
  expect(by.p1!.risk).toBe("high");
  expect(by.p1!.reasons.join(" ")).toContain("No handoff guide");
  expect(by.p2!.risk).toBe("low");
  expect(by.p3!.risk).toBe("medium"); // owns only a draft
  expect(health.totals).toMatchObject({ stale: 1, unowned: 1, sourceChanged: 1, ungrounded: 1 });
  expect(health.stuckDrafts.map((d) => d.articleId)).toEqual(["a4"]);
  expect(health.actions.some((a) => a.type === "interview" && a.personId === "p1")).toBe(true);
  expect(health.actions[0]!.severity).toBe("high");
});

test("score never reads healthy for drafts alone and is perfect for a documented, reviewed team", () => {
  expect(computeHealth({ articles: [], people: [], now: NOW }).score).toBe(0);
  const draftsOnly = computeHealth({
    articles: [{ id: "d", title: "D", status: "draft", content: doc(long), ownerId: "p", updatedAt: day(-1) }],
    people: [{ id: "p", name: "P", status: "active" }],
    now: NOW,
  });
  expect(draftsOnly.score).toBeLessThanOrEqual(30);
  const healthy = computeHealth({
    articles: [article({ id: "ok", ownerId: "p" })],
    people: [{ id: "p", name: "P", status: "active" }],
    now: NOW,
  });
  expect(healthy.score).toBe(100);
});

test("a leave date inside the window counts as leaving", () => {
  const health = computeHealth({
    articles: [],
    people: [{ id: "p", name: "Pat", status: "active", leaveDate: day(20).slice(0, 10) }],
    now: NOW,
  });
  expect(health.people[0]!.leaving).toBe(true);
});

test("changed sources compare the captured version with the index", () => {
  const index = new Map([["drive-1", { id: "drive-1", updatedAt: day(-1) }]]);
  expect(changedSources({ sources: [{ id: "drive-1", modifiedTime: day(-5) }] }, index)).toHaveLength(1);
  expect(changedSources({ sources: [{ id: "drive-1", modifiedTime: day(0) }] }, index)).toHaveLength(0);
  expect(changedSources({ sources: [{ id: "gone", modifiedTime: day(-5) }] }, index)).toHaveLength(0);
});

test("interview gaps and plan come from what is undocumented about the person's work", () => {
  const person = { id: "p", name: "Dana", role: "Director" };
  expect(gapsFor(person, [], [], NOW).map((g) => g.kind)).toEqual(["undocumented"]);
  const review = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Review questions" }] },
      { type: "paragraph", content: [{ type: "text", text: "Who signs?" }] },
    ],
  };
  const gaps = gapsFor(
    person,
    [
      { id: "d", title: "Draft SOP", status: "draft", ownerId: "p", content: review },
      article({ id: "s", title: "Old SOP", ownerId: "p", reviewDueAt: day(-5), conflicts: [{ topic: "timing", note: "Two weeks vs. ten days." }] }),
    ],
    [],
    NOW,
  );
  for (const kind of ["unpublished", "open-question", "thin", "stale", "conflict"])
    expect(gaps.map((g) => g.kind)).toContain(kind);
  const plan = interviewPlan(person, [{ id: "d", title: "Draft SOP", status: "draft", ownerId: "p", content: review }], [], NOW);
  expect(plan.questions[0]!.origin).toBe("gap");
  expect(plan.questions.some((q) => q.origin === "template")).toBe(true);
  expect(plan.agentBrief).toContain("ONE question at a time");
  expect(plan.agentBrief).toContain("Draft SOP");
});

test("handoff outline is built only from recorded facts", () => {
  const sections = outlineSections({
    person: { id: "p", name: "Dana", role: "Director", status: "leaving", leaveDate: "2026-11-01" },
    successor: null,
    articles: [
      article({ id: "a1", title: "Gift acknowledgment", ownerId: "p", publishedSources: [{ id: "d", title: "Letters", url: "https://docs.google.com/d/1" }] }),
    ],
    at: NOW,
  });
  const text = JSON.stringify(sections);
  expect(sections.map((s) => s.heading)).toEqual([
    "Role summary",
    "Processes they own",
    "Needs attention before handoff",
    "Source documents",
    "First 30 days for the successor",
  ]);
  expect(text).toContain("2026-11-01");
  expect(text).toContain("not yet assigned");
  expect(sectionsToDoc(sections).content.length).toBeGreaterThan(5);
});

test("API: health, interview plan, and a no-AI handoff outline that is regenerated in place", async () => {
  const store = await createMemoryStore();
  try {
    await seed(store);
    const app = createApp(store, { requireAuth: false });
    const call = async (path: string, method = "GET", body?: unknown) => {
      const res = await app(
        new Request(`http://localhost${path}`, {
          method,
          ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
        }),
      );
      return { status: res.status, body: (await res.json()) as any };
    };
    const person = (await call("/api/people", "POST", { name: "Sam Lee", role: "Operations" })).body;
    await call(`/api/people/${person.id}`, "PATCH", { status: "leaving" });
    const health = await call("/api/insights/health");
    expect(health.status).toBe(200);
    expect(health.body.people.find((p: any) => p.personId === person.id).risk).toBe("high");

    const plan = await call(`/api/people/${person.id}/interview`, "POST", {});
    expect(plan.status).toBe(201);
    expect(plan.body.agentBrief).toContain("Sam Lee");
    expect((await call("/api/people/missing/interview", "POST", {})).status).toBe(404);

    const first = await call(`/api/people/${person.id}/handoff`, "POST", { mode: "outline" });
    expect(first.status).toBe(201);
    expect(first.body.draft.status).toBe("draft");
    expect(first.body.person.handoffArticleId).toBe(first.body.draft.id);
    const again = await call(`/api/people/${person.id}/handoff`, "POST", { mode: "outline" });
    expect(again.body.draft.id).toBe(first.body.draft.id);
    const boot = await call("/api/bootstrap");
    expect(boot.body.articles.some((a: any) => a.id === first.body.draft.id)).toBe(true);
  } finally {
    await store.close();
  }
});

test("Google connections survive a restart and are stored sealed", async () => {
  process.env.TOKEN_ENCRYPTION_KEY = "test-only-key";
  const originalFetch = globalThis.fetch;
  const store = await createMemoryStore();
  const env = {
    id: process.env.GOOGLE_CLIENT_ID,
    secret: process.env.GOOGLE_CLIENT_SECRET,
  };
  try {
    process.env.GOOGLE_CLIENT_ID = "c";
    process.env.GOOGLE_CLIENT_SECRET = "s";
    expect(unseal<{ a: number }>(seal({ a: 1 }, Buffer.alloc(32, 1)), Buffer.alloc(32, 1)).a).toBe(1);
    expect(() => unseal(seal({ a: 1 }, Buffer.alloc(32, 1)), Buffer.alloc(32, 2))).toThrow();
    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token")
        return Response.json({ access_token: "private-access", refresh_token: "private-refresh", expires_in: 3600 });
      if (url.startsWith("https://oauth2.googleapis.com/revoke")) return new Response("{}");
      throw new Error("unexpected " + url);
    }) as unknown as typeof fetch;
    const make = () => createGoogleHandler({ vault: storeVault(store), upsertFile: async () => {} });
    const first = make();
    const start = (await first(new Request("http://localhost/auth/google/start")))!;
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const callback = (await first(
      new Request(`http://localhost/auth/google/callback?state=${state}&code=x`, {
        headers: { cookie: `orgflow_oauth_state=${state}` },
      }),
    ))!;
    const session = callback.headers.getSetCookie().find((c) => c.startsWith("orgflow_google="))!.split(";")[0]!;
    const row = JSON.stringify(await store.list("gsessions"));
    expect(row).not.toContain("private-access");
    expect(row).not.toContain("private-refresh");

    // A brand-new handler (process restart) still recognises the session cookie.
    const restarted = make();
    const status: any = await (
      await restarted(new Request("http://localhost/api/integrations/google", { headers: { cookie: session } }))
    )!.json();
    expect(status.connected).toBe(true);
    expect(status.sessionStorage).toBe("encrypted-database");

    await restarted(
      new Request("http://localhost/api/integrations/google/disconnect", { method: "POST", headers: { cookie: session } }),
    );
    expect(await store.list("gsessions")).toEqual([]);
    const after: any = await (
      await make()(new Request("http://localhost/api/integrations/google", { headers: { cookie: session } }))
    )!.json();
    expect(after.connected).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    if (env.id === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = env.id;
    if (env.secret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = env.secret;
    await store.close();
  }
});
