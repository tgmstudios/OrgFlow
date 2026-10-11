import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFrontendHandler } from "./server";

test("production serves public /a/ and deep links without a dev host gate", async () => {
  const dir = mkdtempSync(join(tmpdir(), "orgflow-static-"));
  try {
    await Bun.write(join(dir, "index.html"), "<h1>OrgFlow</h1>");
    await Bun.write(join(dir, "index-abc.js"), 'console.log("app")');
    const app = createFrontendHandler({
      production: true,
      backend: "http://127.0.0.1:3003",
      distDirectory: dir,
    });
    for (const path of ["/a/", "/a/files", "/a/knowledge-base"]) {
      const r = await app(new Request("https://orgflow.dev" + path));
      expect(r.status).toBe(200);
      expect(await r.text()).toContain("OrgFlow");
    }
    const js = await app(new Request("https://orgflow.dev/a/index-abc.js"));
    expect(js.status).toBe(200);
    expect(js.headers.get("cache-control")).toContain("immutable");
    const redirect = await app(new Request("https://orgflow.dev/a"));
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("location")).toBe("/a/");
    for (const path of [
      "/a/missing.js",
      "/a/%2eenv",
      "/a/%2e%2e%2fsecret",
      "/index.ts",
    ])
      expect(
        (await app(new Request("https://orgflow.dev" + path))).status,
      ).toBe(404);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("frontend proxy preserves API prefix and origin while setting upstream Host", async () => {
  let received:
    { url: string; host: string | null; origin: string | null } | undefined;
  const upstream = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (req) => {
      received = {
        url: req.url,
        host: req.headers.get("host"),
        origin: req.headers.get("origin"),
      };
      return Response.json({ ok: true });
    },
  });
  try {
    const app = createFrontendHandler({
      production: true,
      backend: upstream.url.toString(),
    });
    const response = await app(
      new Request("https://orgflow.dev/api/categories", {
        method: "POST",
        headers: {
          host: "orgflow.dev",
          origin: "https://orgflow.dev",
          "content-type": "application/json",
        },
        body: '{"name":"Operations"}',
      }),
    );
    expect(response.status).toBe(200);
    expect(new URL(received!.url).pathname).toBe("/api/categories");
    expect(received!.host).toBe(upstream.url.host);
    expect(received!.origin).toBe("https://orgflow.dev");
  } finally {
    upstream.stop(true);
  }
});
