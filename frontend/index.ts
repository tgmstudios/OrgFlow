import page from "./index.html";
const port = Number(process.env.PORT ?? 3002);
const backend = process.env.BACKEND_URL ?? "http://localhost:3003";
Bun.serve({
  port,
  hostname: process.env.HOST ?? "127.0.0.1",
  routes: { "/": page },
  async fetch(req) {
    const url = new URL(req.url);
    if (
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/auth/") ||
      url.pathname.startsWith("/docs/") ||
      ["/docs", "/swagger", "/openapi.json"].includes(url.pathname)
    ) {
      try {
        return await fetch(new URL(url.pathname + url.search, backend), {
          method: req.method,
          headers: req.headers,
          body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
          redirect: "manual",
        });
      } catch {
        return Response.json(
          { error: "Backend unavailable. Start the backend on port 3003." },
          { status: 503 },
        );
      }
    }
    return new Response("Not found", { status: 404 });
  },
  development: { hmr: true, console: true },
});
console.log(`OrgFlow frontend listening on :${port}`);
