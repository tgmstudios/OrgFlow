import { extname, resolve, sep } from "node:path";

export function createFrontendHandler(options: {
  production: boolean;
  backend: string;
  basePath?: string;
  distDirectory?: string;
}) {
  const base = (options.basePath ?? "/a").replace(/\/$/, "");
  const dist = resolve(
    options.distDirectory ?? new URL("./dist/", import.meta.url).pathname,
  );
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/auth/") ||
      url.pathname.startsWith("/docs/") ||
      ["/docs", "/swagger", "/openapi.json"].includes(url.pathname)
    ) {
      try {
        const headers = new Headers(req.headers);
        headers.delete("host");
        return await fetch(
          new URL(url.pathname + url.search, options.backend),
          {
            method: req.method,
            headers,
            body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
            redirect: "manual",
          },
        );
      } catch {
        return Response.json(
          { error: "Backend unavailable. Please retry shortly." },
          { status: 503 },
        );
      }
    }
    if (!options.production) return new Response("Not found", { status: 404 });
    if (!["GET", "HEAD"].includes(req.method))
      return new Response("Method not allowed", { status: 405 });
    if (url.pathname === base || url.pathname === "/")
      return new Response(null, {
        status: 308,
        headers: { Location: base + "/" },
      });
    if (!url.pathname.startsWith(base + "/"))
      return new Response("Not found", { status: 404 });
    let relative: string;
    try {
      relative = decodeURIComponent(url.pathname.slice(base.length + 1));
    } catch {
      return new Response("Invalid path", { status: 400 });
    }
    const path = resolve(dist, relative || "index.html");
    if (
      !path.startsWith(dist + sep) ||
      relative.split(/[\\/]/).some((part) => part.startsWith("."))
    )
      return new Response("Not found", { status: 404 });
    let file = Bun.file(path);
    if (!(await file.exists())) {
      if (extname(relative)) return new Response("Not found", { status: 404 });
      file = Bun.file(resolve(dist, "index.html"));
    }
    if (!(await file.exists()))
      return new Response("Frontend build unavailable", { status: 503 });
    return new Response(req.method === "HEAD" ? null : file, {
      headers: {
        "Content-Type": file.type,
        "Cache-Control": file.type.startsWith("text/html")
          ? "no-cache"
          : "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  };
}
