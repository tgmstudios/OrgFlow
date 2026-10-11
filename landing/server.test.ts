import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLandingHandler } from "./server";

describe("landing static server", () => {
  let temporaryDirectory: string;
  let handler: ReturnType<typeof createLandingHandler>;
  const html = "<!doctype html><title>OrgFlow</title><h1>Knowledge stays.</h1>";
  const javascript = 'console.log("OrgFlow sample");';

  beforeAll(() => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "orgflow-landing-test-"));
    const directory = join(temporaryDirectory, "dist");
    mkdirSync(directory);
    writeFileSync(join(directory, "index.html"), html);
    writeFileSync(join(directory, "chunk-wrkgy2zp.js"), javascript);
    writeFileSync(
      join(directory, "chunk-pgy37yd3.css"),
      "body { color: #302d3b; }",
    );
    writeFileSync(
      join(directory, "favicon.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    writeFileSync(
      join(directory, "favicon-xyg63nc2.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    writeFileSync(join(directory, "robots.txt"), "User-agent: *\nAllow: /\n");
    writeFileSync(
      join(temporaryDirectory, "private.txt"),
      "Never serve outside dist.",
    );
    handler = createLandingHandler(directory);
  });

  afterAll(() => rmSync(temporaryDirectory, { recursive: true, force: true }));

  const request = (path: string, method = "GET") =>
    handler(new Request(`https://orgflow.dev${path}`, { method }));

  test("serves the homepage and real assets with their MIME types", async () => {
    const homepage = await request("/");
    expect(homepage.status).toBe(200);
    expect(homepage.headers.get("content-type")).toContain("text/html");
    expect(await homepage.text()).toBe(html);

    for (const [path, mime] of [
      ["/chunk-wrkgy2zp.js", "javascript"],
      ["/chunk-pgy37yd3.css", "text/css"],
      ["/favicon.svg", "image/svg+xml"],
      ["/robots.txt", "text/plain"],
    ]) {
      const response = await request(path!);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(mime!);
    }
  });

  test("HEAD preserves asset metadata and returns no response body", async () => {
    for (const path of ["/", "/chunk-wrkgy2zp.js", "/favicon.svg"]) {
      const get = await request(path);
      const head = await request(path, "HEAD");
      expect(head.status).toBe(200);
      expect(head.headers.get("content-length")).toBe(
        String((await get.arrayBuffer()).byteLength),
      );
      expect(head.headers.get("content-type")).toBe(
        get.headers.get("content-type"),
      );
      expect(head.headers.get("cache-control")).toBe(
        get.headers.get("cache-control"),
      );
      expect(await head.text()).toBe("");
    }
  });

  test("missing files and unknown paths return 404 instead of homepage HTML", async () => {
    for (const path of [
      "/missing.js",
      "/missing.css",
      "/missing.svg",
      "/unknown",
      "/index.ts",
    ]) {
      const response = await request(path);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain("Knowledge stays.");
    }
  });

  test("does not serve the existing application and backend routes", async () => {
    for (const path of [
      "/a",
      "/a/",
      "/a/files",
      "/a/knowledge-base",
      "/api",
      "/api/bootstrap",
      "/auth/google/callback",
      "/docs",
      "/docs/swagger-ui.js",
      "/swagger",
      "/health",
      "/openapi.json",
    ]) {
      expect((await request(path)).status).toBe(404);
    }
  });

  test("rejects encoded traversal, backslashes, null bytes, and malformed paths", async () => {
    for (const path of [
      "/%2e%2e%2fprivate.txt",
      "/nested%2f%2e%2e%2f%2e%2e%2fprivate.txt",
      "/%5c..%5cprivate.txt",
      "/index.html%00",
    ]) {
      const response = await request(path);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain("Never serve outside dist.");
    }
    expect((await request("/%E0%A4%A")).status).toBe(400);
  });

  test("rejects mutation methods and advertises GET and HEAD", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const response = await request("/", method);
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
    }
  });

  test("caches hashed bundles and revalidates the homepage and public assets", async () => {
    for (const path of [
      "/chunk-wrkgy2zp.js",
      "/chunk-pgy37yd3.css",
      "/favicon-xyg63nc2.svg",
    ]) {
      expect((await request(path)).headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
      );
    }
    for (const path of ["/", "/favicon.svg", "/robots.txt"]) {
      const response = await request(path);
      expect(response.headers.get("cache-control")).toBe(
        "public, max-age=0, must-revalidate",
      );
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("referrer-policy")).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(response.headers.get("content-security-policy")).toContain(
        "frame-ancestors 'none'",
      );
    }
  });
});
