import { openStore, seed } from "./store";
import { seedSamples } from "./samples";
import { createApp } from "./app";
const store = await openStore({
  databaseUrl: process.env.DATABASE_URL,
  sqlitePath: process.env.SQLITE_PATH,
});
await seed(store);
await seedSamples(store);
const app = createApp(store);
// AI answers and drafts, Discover and Gmail/Drive indexing can take up to a minute; everything else keeps
// Bun's 10 s idle timeout.
const slow = /^\/api\/(agent|discover|candidates\/[^/]+\/draft|people\/[^/]+\/handoff|integrations\/google\/(index|sync))$/;
const server = Bun.serve({
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3003),
  maxRequestBodySize: 6_000_000,
  fetch(req, server) {
    if (slow.test(new URL(req.url).pathname)) server.timeout(req, 120);
    return app(req);
  },
});
console.log(
  `OrgFlow backend: ${server.url} (${store.mode}). API docs: ${server.url}docs`,
);
if (store.mode === "sqlite-development")
  console.log(
    "Development SQLite fallback; set DATABASE_URL for PostgreSQL. Synthetic demo data; authentication not configured.",
  );
