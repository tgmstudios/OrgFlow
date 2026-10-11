import { test, expect } from "bun:test";
import { openStore, seed } from "./store";
import { createApp } from "./app";
const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
async function fixture() {
  const store = await openStore({ sqlitePath: ":memory:" });
  await seed(store);
  const app = createApp(store, { requireAuth: false });
  return {
    store,
    call: async (path: string, method = "GET", body?: unknown) =>
      app(
        new Request(`http://localhost${path}`, {
          method,
          ...(body
            ? {
                body: JSON.stringify(body),
                headers: { "content-type": "application/json" },
              }
            : {}),
        }),
      ),
  };
}
test("autosave never overwrites published version or accepts client publication", async () => {
  const { store, call } = await fixture();
  try {
    const res = await call("/api/articles/article-welcome", "PATCH", {
      content: doc("Changed"),
      status: "published",
    });
    expect(res.status).toBe(200);
    const value: any = await res.json();
    expect(value.status).toBe("draft");
    expect(value.content).toEqual(doc("Changed"));
    expect(value.publishedContent).not.toEqual(value.content);
    const pub: any = await (
      await call("/api/articles/article-welcome/publish", "POST")
    ).json();
    expect(pub.status).toBe("published");
    expect(pub.publishedContent).toEqual(doc("Changed"));
  } finally {
    await store.close();
  }
});
test("file organization cannot mutate provider location", async () => {
  const { store, call } = await fixture();
  try {
    const before = await store.get("files", "file-drive");
    const res = await call("/api/files/file-drive", "PATCH", {
      orgflowPath: "/Team",
      originalPath: "/Moved",
      url: "https://evil.example",
    });
    const value: any = await res.json();
    expect(value.orgflowPath).toBe("/Team");
    expect(value.originalPath).toBe(before?.originalPath);
    expect(value.url).toBe(before?.url);
  } finally {
    await store.close();
  }
});
test("reject missing categories and malformed documents, preserve empty categories", async () => {
  const { store, call } = await fixture();
  try {
    expect(
      (
        await call("/api/articles", "POST", {
          title: "Test",
          categoryId: "missing",
          content: doc("Test"),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("/api/articles", "POST", {
          title: "Test",
          categoryId: "cat-people",
          content: "bad",
        })
      ).status,
    ).toBe(400);
    const category: any = await (
      await call("/api/categories", "POST", { name: "New category" })
    ).json();
    expect(
      (
        await call(`/api/categories/${category.id}`, "PATCH", {
          name: "Renamed",
        })
      ).status,
    ).toBe(200);
    expect((await call("/api/categories", "POST", { name: "  " })).status).toBe(
      400,
    );
    expect((await call("/api/articles/missing", "PATCH", {})).status).toBe(404);
  } finally {
    await store.close();
  }
});
test("bootstrap labels synthetic data and docs are served locally", async () => {
  const { store, call } = await fixture();
  try {
    const data: any = await (await call("/api/bootstrap")).json();
    expect(data.meta.demo).toBe(true);
    expect(
      data.integrations.every((x: any) => x.status === "disconnected"),
    ).toBe(true);
    expect((await call("/docs")).status).toBe(200);
    expect((await call("/docs/assets/swagger-ui.css")).status).toBe(200);
    expect(
      ((await (await call("/openapi.json")).json()) as any).paths[
        "/api/articles/{id}/publish"
      ],
    ).toBeDefined();
  } finally {
    await store.close();
  }
});

test('cross-origin writes are rejected', async () => {
  const store = await openStore({sqlitePath: ':memory:'});
  try {
    const app = createApp(store, { requireAuth: false });
    const res = await app(new Request('http://localhost/api/categories', {method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json'},body:JSON.stringify({name:'Injected'})}));
    expect(res.status).toBe(403);
    expect(await store.list('categories')).toEqual([]);
  } finally { await store.close(); }
});
