/**
 * Encrypted persistence for provider OAuth sessions. Tokens are sealed with AES-256-GCM before
 * they reach the database, so a database dump alone does not reveal them.
 *
 * Key: TOKEN_ENCRYPTION_KEY (any string, hashed to 256 bits), else a generated key file
 * (TOKEN_KEY_FILE, default backend/data/token.key, mode 0600). Back the key up with the database;
 * losing it only forces people to reconnect Google.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Store } from "./store";

let cachedKey: Buffer | null = null;
function key(): Buffer {
  const configured = process.env.TOKEN_ENCRYPTION_KEY;
  if (configured) return createHash("sha256").update(configured).digest();
  if (cachedKey) return cachedKey;
  const file = process.env.TOKEN_KEY_FILE || new URL("./data/token.key", import.meta.url).pathname;
  if (existsSync(file)) cachedKey = Buffer.from(readFileSync(file, "utf8").trim(), "base64");
  else {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    cachedKey = randomBytes(32);
    writeFileSync(file, cachedKey.toString("base64"), { mode: 0o600 });
    chmodSync(file, 0o600);
  }
  if (cachedKey.length !== 32) throw new Error("Token key file is invalid.");
  return cachedKey;
}

export function seal(value: unknown, k = key()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return "v1:" + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function unseal<T>(sealed: string, k = key()): T {
  if (!sealed.startsWith("v1:")) throw new Error("Unsupported sealed value.");
  const raw = Buffer.from(sealed.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
}

export interface SessionVault {
  get<T>(id: string): Promise<T | null>;
  put(id: string, value: unknown, expiresAt: number): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Sealed records in the (unscoped) base store under kind `gsessions`. */
export function storeVault(store: Store): SessionVault {
  return {
    async get<T>(id: string) {
      const row: any = await store.get("gsessions", id);
      if (!row) return null;
      if (row.expiresAt < Date.now()) {
        await store.delete("gsessions", id);
        return null;
      }
      try {
        return unseal<T>(row.sealed);
      } catch {
        return null; // key rotated or corrupted: the person reconnects
      }
    },
    async put(id, value, expiresAt) {
      await store.put("gsessions", { id, expiresAt, sealed: seal(value) });
    },
    async delete(id) {
      await store.delete("gsessions", id);
    },
  };
}
