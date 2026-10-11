import { Database } from "bun:sqlite";
import { SQL } from "bun";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export type Entity = { id: string; [key: string]: unknown };
export interface Store {
  mode: string;
  list(kind: string): Promise<Entity[]>;
  get(kind: string, id: string): Promise<Entity | null>;
  put(kind: string, value: Entity): Promise<void>;
  delete(kind: string, id: string): Promise<void>;
  close(): Promise<void>;
}
export async function openStore(
  options: { databaseUrl?: string; sqlitePath?: string } = {},
): Promise<Store> {
  if (options.databaseUrl) {
    const sql = new SQL(options.databaseUrl);
    await sql`CREATE TABLE IF NOT EXISTS orgflow_entities(kind TEXT NOT NULL,id TEXT NOT NULL,data JSONB NOT NULL,PRIMARY KEY(kind,id))`;
    return {
      mode: "postgresql",
      async list(kind) {
        return (
          await sql`SELECT data FROM orgflow_entities WHERE kind=${kind} ORDER BY id`
        ).map((r: any) => r.data);
      },
      async get(kind, id) {
        return (
          (
            await sql`SELECT data FROM orgflow_entities WHERE kind=${kind} AND id=${id}`
          )[0]?.data ?? null
        );
      },
      async put(kind, value) {
        await sql`INSERT INTO orgflow_entities(kind,id,data) VALUES(${kind},${value.id},${JSON.stringify(value)}::jsonb) ON CONFLICT(kind,id) DO UPDATE SET data=EXCLUDED.data`;
      },
      async delete(kind, id) {
        await sql`DELETE FROM orgflow_entities WHERE kind=${kind} AND id=${id}`;
      },
      async close() {
        await sql.close();
      },
    };
  }
  const path = options.sqlitePath ?? "./data/orgflow.sqlite";
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.exec(
    "PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id))",
  );
  return {
    mode: "sqlite-development",
    async list(kind) {
      return (
        db
          .query("SELECT data FROM entities WHERE kind=? ORDER BY id")
          .all(kind) as { data: string }[]
      ).map((r) => JSON.parse(r.data));
    },
    async get(kind, id) {
      const r = db
        .query("SELECT data FROM entities WHERE kind=? AND id=?")
        .get(kind, id) as { data: string } | null;
      return r ? JSON.parse(r.data) : null;
    },
    async put(kind, value) {
      db.query(
        "INSERT INTO entities(kind,id,data) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
      ).run(kind, value.id, JSON.stringify(value));
    },
    async delete(kind, id) {
      db.query("DELETE FROM entities WHERE kind=? AND id=?").run(kind, id);
    },
    async close() {
      db.close();
    },
  };
}
export async function seed(store: Store) {
  if (await store.get("meta", "seed")) return;
  const now = new Date().toISOString();
  const content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Synthetic example: record the gift, send a personal thank-you within two working days, and schedule follow-up. Replace with your organization’s approved process.",
          },
        ],
      },
    ],
  };
  for (const value of [
    { id: "cat-stewardship", name: "Donor stewardship" },
    { id: "cat-operations", name: "Operations" },
    { id: "cat-people", name: "People & onboarding" },
  ])
    await store.put("categories", value);
  await store.put("articles", {
    id: "article-welcome",
    synthetic: true,
    title: "Donor thank-you process",
    categoryId: "cat-stewardship",
    content,
    status: "published",
    publishedContent: content,
    publishedTitle: "Donor thank-you process",
    publishedCategoryId: "cat-stewardship",
    updatedAt: now,
    publishedAt: now,
  });
  for (const [id, name, provider, path, url] of [
    [
      "drive",
      "Donor stewardship overview",
      "Google Drive",
      "/Fundraising/Stewardship",
      "https://drive.google.com/",
    ],
    [
      "sharepoint",
      "Volunteer onboarding checklist",
      "SharePoint",
      "/Shared Documents/People",
      "https://www.microsoft.com/microsoft-365/sharepoint/collaboration",
    ],
    [
      "onedrive",
      "Annual planning notes",
      "OneDrive",
      "/Planning",
      "https://onedrive.live.com/",
    ],
  ])
    await store.put("files", {
      id: `file-${id}`,
      synthetic: true,
      name,
      provider,
      originalPath: path,
      orgflowPath: `/${provider}${path}`,
      url,
      updatedAt: now,
      type: "document",
    });
  for (const [i, title, kind] of [
    [1, "Stewardship team check-in", "meeting"],
    [2, "Review donor thank-you process", "deadline"],
  ] as const) {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + i);
    start.setUTCHours(14, 0, 0, 0);
    await store.put("events", {
      id: `event-${i}`,
      synthetic: true,
      title,
      start: start.toISOString(),
      kind,
    });
  }
  await store.put("meta", { id: "seed", version: 1 });
}
