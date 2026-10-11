import { Database } from "bun:sqlite";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/prisma/client";

const sourcePath = process.env.SQLITE_SOURCE;
const databaseUrl = process.env.DATABASE_URL;
if (!sourcePath || !databaseUrl) {
  throw new Error("Set SQLITE_SOURCE to the backed-up SQLite file and DATABASE_URL to the PostgreSQL target.");
}

const sqlite = new Database(sourcePath, { readonly: true });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};
try {
  const rows = sqlite.query("SELECT kind, id, data FROM entities ORDER BY kind, id").all() as {
    kind: string;
    id: string;
    data: string;
  }[];
  const existing = await prisma.entity.findMany({ select: { kind: true, id: true, data: true } });
  const existingByKey = new Map(existing.map((row) => [`${row.kind}\u0000${row.id}`, row.data]));
  for (const row of rows) {
    const current = existingByKey.get(`${row.kind}\u0000${row.id}`);
    if (current !== undefined && stable(current) !== stable(JSON.parse(row.data)))
      throw new Error("PostgreSQL already contains a conflicting record; import stopped without overwriting it.");
  }
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const data = JSON.parse(row.data) as Prisma.InputJsonValue;
      await tx.entity.upsert({
        where: { kind_id: { kind: row.kind, id: row.id } },
        create: { kind: row.kind, id: row.id, data },
        update: { data },
      });
    }
  });
  const imported = await prisma.entity.findMany({ select: { kind: true, id: true, data: true } });
  if (imported.length !== rows.length) throw new Error("Imported record count does not match the SQLite source.");
  const importedByKey = new Map(imported.map((row) => [`${row.kind}\u0000${row.id}`, row.data]));
  for (const row of rows) {
    if (stable(importedByKey.get(`${row.kind}\u0000${row.id}`)) !== stable(JSON.parse(row.data)))
      throw new Error("Imported records failed content verification.");
  }
  console.log(`Verified ${rows.length} records across ${new Set(rows.map((row) => row.kind)).size} record types.`);
} finally {
  sqlite.close();
  await prisma.$disconnect();
}
