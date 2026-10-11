import { test, expect } from "bun:test";
import { createMemoryStore, seed } from "./store";

test("seed is idempotent and preserves staff edits", async () => {
  const store = createMemoryStore();
  await seed(store);
  await store.put("categories", { id: "cat-people", name: "Staff category" });
  await seed(store);
  expect((await store.get("categories", "cat-people"))?.name).toBe("Staff category");
  expect((await store.list("articles")).length).toBe(1);
  await store.close();
});
