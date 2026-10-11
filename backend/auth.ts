import type { Store } from "./store";

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type User = { id: string; email: string; name: string };

const COOKIE = "orgflow_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

const sha256 = (value: string) =>
  new Bun.CryptoHasher("sha256").update(value).digest("hex");
const normalizeEmail = (v: unknown) => {
  const email = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AuthError(400, "Enter a valid email address");
  return email;
};
const readCookie = (req: Request, name: string) =>
  req.headers
    .get("cookie")
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(name + "="))
    ?.slice(name.length + 1);
const publicUser = (u: any): User => ({
  id: u.id,
  email: u.email,
  name: u.name,
});

export function createAuth(store: Store) {
  const failures = new Map<string, { count: number; first: number }>();

  const cookieHeader = (req: Request, value: string, maxAge: number) => {
    const secure = new URL(req.url).protocol === "https:" ||
      req.headers.get("x-forwarded-proto") === "https";
    return `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
  };

  async function startSession(req: Request, user: User) {
    const token = crypto.randomUUID() + crypto.randomUUID();
    await store.put("sessions", {
      id: sha256(token),
      userId: user.id,
      expiresAt: Date.now() + SESSION_MS,
    });
    return cookieHeader(req, token, SESSION_MS / 1000);
  }

  /** The signed-in user for this request, or null. */
  async function currentUser(req: Request): Promise<User | null> {
    const token = readCookie(req, COOKIE);
    if (!token) return null;
    const session = await store.get("sessions", sha256(token));
    if (!session) return null;
    if ((session.expiresAt as number) < Date.now()) {
      await store.delete("sessions", session.id);
      return null;
    }
    const user = await store.get("users", session.userId as string);
    return user ? publicUser(user) : null;
  }

  function checkRate(email: string) {
    const entry = failures.get(email);
    if (!entry) return;
    if (Date.now() - entry.first > FAILURE_WINDOW_MS) failures.delete(email);
    else if (entry.count >= MAX_FAILURES)
      throw new AuthError(429, "Too many attempts. Try again later.");
  }

  /** Handles /api/auth/*. Returns null for paths it does not own. */
  async function handle(req: Request, path: string): Promise<Response | null> {
    if (!path.startsWith("/api/auth/")) return null;
    const json = (data: unknown, status = 200, setCookie?: string) =>
      Response.json(data, {
        status,
        headers: setCookie ? { "Set-Cookie": setCookie } : undefined,
      });
    if (req.method === "GET" && path === "/api/auth/me") {
      const user = await currentUser(req);
      return json({ user });
    }
    if (req.method !== "POST") throw new AuthError(404, "Not found");
    if (path === "/api/auth/logout") {
      const token = readCookie(req, COOKIE);
      if (token) await store.delete("sessions", sha256(token));
      return json({ ok: true }, 200, cookieHeader(req, "", 0));
    }
    if (path !== "/api/auth/signup" && path !== "/api/auth/login")
      throw new AuthError(404, "Not found");
    let body: any;
    try {
      body = JSON.parse((await req.text()) || "{}");
    } catch {
      throw new AuthError(400, "Invalid JSON");
    }
    if (!body || typeof body !== "object")
      throw new AuthError(400, "Expected JSON object");
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const id = sha256(email);

    if (path === "/api/auth/signup") {
      const name =
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim().slice(0, 100)
          : email.split("@")[0]!;
      if (password.length < 8 || password.length > 200)
        throw new AuthError(400, "Password must be 8–200 characters");
      if (await store.get("users", id))
        throw new AuthError(409, "An account with this email already exists");
      const user = {
        id,
        email,
        name,
        passwordHash: await Bun.password.hash(password),
        createdAt: new Date().toISOString(),
      };
      await store.put("users", user);
      return json(
        { user: publicUser(user) },
        201,
        await startSession(req, publicUser(user)),
      );
    }

    checkRate(email);
    const user = await store.get("users", id);
    const ok =
      !!user &&
      password.length <= 200 &&
      (await Bun.password.verify(password, user.passwordHash as string));
    if (!ok || !user) {
      const entry = failures.get(email) ?? { count: 0, first: Date.now() };
      entry.count++;
      failures.set(email, entry);
      throw new AuthError(401, "Incorrect email or password");
    }
    failures.delete(email);
    return json(
      { user: publicUser(user) },
      200,
      await startSession(req, publicUser(user)),
    );
  }

  return { handle, currentUser };
}
