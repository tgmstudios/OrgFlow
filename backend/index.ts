import { openStore, seed } from "./store";
import { createApp } from "./app";
const store = await openStore({
  databaseUrl: process.env.DATABASE_URL,
  sqlitePath: process.env.SQLITE_PATH,
});
await seed(store);
const server = Bun.serve({
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3003),
  maxRequestBodySize: 6_000_000,
  fetch: createApp(store),
});
console.log(
  `OrgFlow backend: ${server.url} (${store.mode}). API docs: ${server.url}docs`,
);
if (store.mode === "sqlite-development")
  console.log(
    "Development SQLite fallback; set DATABASE_URL for PostgreSQL. Synthetic demo data; authentication not configured.",
  );
