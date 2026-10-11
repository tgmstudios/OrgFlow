import { test, expect } from "bun:test";
import { openStore, seed } from "./store";
import { createApp } from "./app";

async function fixture() {
  const store = await openStore({ sqlitePath: ":memory:" });
  await seed(store);
  const app = createApp(store);
  const call = (path: string, method = "GET", body?: unknown, cookie?: string) =>
    app(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  return { store, call };
}
const sessionCookie = (res: Response) =>
  res.headers.get("set-cookie")!.split(";")[0]!;

test("API requires sign-in; health and docs stay open", async () => {
  const { store, call } = await fixture();
  try {
    expect((await call("/api/bootstrap")).status).toBe(401);
    expect((await call("/api/categories", "POST", { name: "x" })).status).toBe(401);
    expect((await call("/health")).status).toBe(200);
    expect((await call("/openapi.json")).status).toBe(200);
    expect(await (await call("/api/auth/me")).json()).toEqual({ user: null });
  } finally {
    await store.close();
  }
});

test("signup, session, logout and login", async () => {
  const { store, call } = await fixture();
  try {
    const signup = await call("/api/auth/signup", "POST", {
      email: "Ada@Example.org",
      password: "correct horse",
      name: "Ada",
    });
    expect(signup.status).toBe(201);
    const set = signup.headers.get("set-cookie")!;
    expect(set).toContain("HttpOnly");
    expect(set).toContain("SameSite=Lax");
    const body: any = await signup.json();
    expect(body.user.email).toBe("ada@example.org");
    expect(body.user.passwordHash).toBeUndefined();
    const cookie = sessionCookie(signup);

    expect((await call("/api/bootstrap", "GET", undefined, cookie)).status).toBe(200);
    const me: any = await (await call("/api/auth/me", "GET", undefined, cookie)).json();
    expect(me.user.name).toBe("Ada");

    expect((await call("/api/auth/logout", "POST", {}, cookie)).status).toBe(200);
    expect((await call("/api/bootstrap", "GET", undefined, cookie)).status).toBe(401);

    const login = await call("/api/auth/login", "POST", {
      email: "ada@example.org",
      password: "correct horse",
    });
    expect(login.status).toBe(200);
    expect(
      (await call("/api/bootstrap", "GET", undefined, sessionCookie(login))).status,
    ).toBe(200);
  } finally {
    await store.close();
  }
});

test("rejects duplicates, weak passwords and bad credentials", async () => {
  const { store, call } = await fixture();
  try {
    const creds = { email: "a@b.co", password: "longenough1" };
    expect((await call("/api/auth/signup", "POST", { ...creds, password: "short" })).status).toBe(400);
    expect((await call("/api/auth/signup", "POST", { email: "nope", password: "longenough1" })).status).toBe(400);
    expect((await call("/api/auth/signup", "POST", creds)).status).toBe(201);
    expect((await call("/api/auth/signup", "POST", creds)).status).toBe(409);
    expect((await call("/api/auth/login", "POST", { ...creds, password: "wrongwrong" })).status).toBe(401);
    expect((await call("/api/auth/login", "POST", { email: "none@b.co", password: "wrongwrong" })).status).toBe(401);
  } finally {
    await store.close();
  }
});

test("repeated failed logins are rate limited", async () => {
  const { store, call } = await fixture();
  try {
    await call("/api/auth/signup", "POST", { email: "r@b.co", password: "longenough1" });
    let last = 0;
    for (let i = 0; i < 11; i++)
      last = (await call("/api/auth/login", "POST", { email: "r@b.co", password: "badbadbad" })).status;
    expect(last).toBe(429);
  } finally {
    await store.close();
  }
});
