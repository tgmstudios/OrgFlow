import { resolve, sep } from "node:path";

export function createLandingHandler(
  directory = resolve(import.meta.dir, "dist"),
) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }
    let path: string;
    try {
      path = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response("Invalid path", { status: 400 });
    }
    if (
      /^\/(?:a|api|auth|docs|swagger|health)(?:\/|$)/.test(path) ||
      path === "/openapi.json"
    ) {
      return new Response("Not found", { status: 404 });
    }
    if (path.includes("\0") || path.includes("\\"))
      return new Response("Not found", { status: 404 });
    const root = resolve(directory);
    const filePath = resolve(root, path === "/" ? "index.html" : `.${path}`);
    if (!filePath.startsWith(root + sep))
      return new Response("Not found", { status: 404 });
    const file = Bun.file(filePath);
    if (!(await file.exists()))
      return new Response("Not found", { status: 404 });
    const headers = {
      "Content-Type": file.type,
      "Content-Length": String(file.size),
      "Cache-Control":
        /^\/(?:chunk|favicon)-[a-z0-9]{8,}\.(?:js|css|svg)$/.test(path)
          ? "public, max-age=31536000, immutable"
          : "public, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    };
    return new Response(request.method === "HEAD" ? null : file, { headers });
  };
}
