import { AsyncLocalStorage } from "node:async_hooks";
import type { Store } from "./store";
import { brandRecord } from "./branding";

/**
 * Organization isolation. Each request runs inside its organization's context; the scoped store
 * stores workspace data (articles, files, people, runs, …) under `org:<id>:<kind>`. Accounts and
 * sessions are global. The original shared workspace is the `default` organization and keeps its
 * unprefixed kinds, so existing data and accounts are unaffected.
 */
export const DEFAULT_ORG = "default";
const GLOBAL_KINDS = new Set(["users", "sessions", "orgs", "meta"]);
const context = new AsyncLocalStorage<string>();

export function runInOrg<T>(orgId: string, body: () => Promise<T>): Promise<T> {
  return context.run(orgId, body);
}

export function currentOrg(): string {
  return context.getStore() ?? DEFAULT_ORG;
}

export function scopedStore(base: Store): Store {
  const kindFor = (kind: string) => {
    const org = currentOrg();
    return org === DEFAULT_ORG || GLOBAL_KINDS.has(kind) ? kind : `org:${org}:${kind}`;
  };
  return {
    get mode() {
      return base.mode;
    },
    list: async (kind) => (await base.list(kindFor(kind))).map(value => brandRecord(kind, value)),
    get: async (kind, id) => {
      const value = await base.get(kindFor(kind), id);
      return value ? brandRecord(kind, value) : null;
    },
    put: (kind, value) => base.put(kindFor(kind), value),
    delete: (kind, id) => base.delete(kindFor(kind), id),
    close: () => base.close(),
  };
}

export const inviteCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32],
  ).join("");

/** Categories every new organization starts with (no sample content). */
export const STARTER_CATEGORIES = [
  { id: "cat-stewardship", name: "Donor stewardship" },
  { id: "cat-operations", name: "Operations" },
  { id: "cat-people", name: "People & onboarding" },
];
