import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/prisma/client";

export type Entity = { id: string; [key: string]: unknown };
export interface Store {
  mode: string;
  list(kind: string): Promise<Entity[]>;
  get(kind: string, id: string): Promise<Entity | null>;
  put(kind: string, value: Entity): Promise<void>;
  delete(kind: string, id: string): Promise<void>;
  close(): Promise<void>;
}

export async function openStore(databaseUrl = process.env.DATABASE_URL): Promise<Store> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required; OrgFlow uses PostgreSQL for all persistence.");
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });
  return {
    mode: "postgresql",
    async list(kind) {
      const rows = await prisma.entity.findMany({
        where: { kind },
        orderBy: { id: "asc" },
        select: { data: true },
      });
      return rows.map((row) => row.data as Entity);
    },
    async get(kind, id) {
      const row = await prisma.entity.findUnique({
        where: { kind_id: { kind, id } },
        select: { data: true },
      });
      return (row?.data as Entity | undefined) ?? null;
    },
    async put(kind, value) {
      const data = value as Prisma.InputJsonValue;
      await prisma.entity.upsert({
        where: { kind_id: { kind, id: value.id } },
        create: { kind, id: value.id, data },
        update: { data },
      });
    },
    async delete(kind, id) {
      await prisma.entity.deleteMany({ where: { kind, id } });
    },
    async close() {
      await prisma.$disconnect();
    },
  };
}

/** Isolated test fixture storage. Production and local app runs always use PostgreSQL. */
export function createMemoryStore(): Store {
  const rows = new Map<string, Entity>();
  return {
    mode: "memory-test",
    async list(kind) {
      return [...rows.entries()]
        .filter(([key]) => key.startsWith(`${kind}\u0000`))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, value]) => structuredClone(value));
    },
    async get(kind, id) {
      const value = rows.get(`${kind}\u0000${id}`);
      return value ? structuredClone(value) : null;
    },
    async put(kind, value) {
      rows.set(`${kind}\u0000${value.id}`, structuredClone(value));
    },
    async delete(kind, id) {
      rows.delete(`${kind}\u0000${id}`);
    },
    async close() {
      rows.clear();
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
