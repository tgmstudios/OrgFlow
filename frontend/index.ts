import page from "./index.html";
import { createFrontendHandler } from "./server";
const port = Number(process.env.PORT ?? 3002);
const production = process.env.NODE_ENV === "production";
Bun.serve({
  port,
  hostname: process.env.HOST ?? "127.0.0.1",
  routes: production
    ? undefined
    : {
        "/": page,
        "/files": page,
        "/knowledge-base": page,
        "/checklists": page,
        "/people": page,
        "/knowledge-health": page,
        "/organization": page,
        "/a": page,
        "/a/*": page,
      },
  fetch: createFrontendHandler({
    production,
    backend: process.env.BACKEND_URL ?? "http://127.0.0.1:3003",
    basePath: process.env.FRONTEND_BASE_PATH ?? "/a",
  }),
  development: production ? false : { hmr: true, console: true },
});
console.log(
  `OrgFlow frontend listening on :${port} (${production ? "production /a/" : "development"})`,
);
