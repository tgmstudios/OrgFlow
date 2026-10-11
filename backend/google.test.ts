import { test, expect } from "bun:test";
import { createGoogleHandler } from "./google";

test("Google status and invalid callback protect tokens and state", async () => {
  const handler = createGoogleHandler({
    upsertFile: async () => {
      throw new Error("must not write");
    },
  });
  const status = await handler(
    new Request("http://localhost/api/integrations/google"),
  );
  expect(status?.status).toBe(200);
  expect(status?.headers.get("cache-control")).toBe("no-store");
  const body = (await status!.json()) as Record<string, unknown>;
  expect(body.connected).toBe(false);
  expect(body).not.toHaveProperty("accessToken");
  const response = await handler(
    new Request(
      "http://localhost/auth/google/callback?state=invalid&code=secret",
    ),
  );
  expect(response?.status).toBe(400);
  expect(await response!.text()).not.toContain("secret");
});
test("Google private sources and sync require a connected session", async () => {
  let written = false;
  const handler = createGoogleHandler({
    upsertFile: async () => {
      written = true;
    },
  });
  for (const request of [
    new Request("http://localhost/api/sources/google?provider=drive"),
    new Request("http://localhost/api/integrations/google/sync", {
      method: "POST",
    }),
  ]) {
    const response = await handler(request);
    expect(response?.status).toBe(401);
  }
  expect(written).toBe(false);
});
test("Google handler leaves unrelated routes alone", async () => {
  const handler = createGoogleHandler({ upsertFile: async () => {} });
  expect(
    await handler(new Request("http://localhost/api/articles")),
  ).toBeNull();
});

test("Google OAuth binds state to browser, keeps tokens server-side, and syncs metadata only", async () => {
  const previous = {
    id: process.env.GOOGLE_CLIENT_ID,
    secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect: process.env.GOOGLE_REDIRECT_URI,
  };
  const originalFetch = globalThis.fetch;
  const writes: Record<string, any>[] = [];
  try {
    process.env.GOOGLE_CLIENT_ID = "test-client";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_REDIRECT_URI =
      "http://localhost:3003/auth/google/callback";
    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token")
        return Response.json({
          access_token: "private-test-token",
          expires_in: 3600,
        });
      if (url.startsWith("https://www.googleapis.com/drive/v3/files?"))
        return Response.json({
          files: [
            {
              id: "folder",
              name: "Fundraising",
              mimeType: "application/vnd.google-apps.folder",
            },
            {
              id: "doc",
              name: "Synthetic donor SOP",
              mimeType: "application/vnd.google-apps.document",
              parents: ["folder"],
              webViewLink: "https://docs.google.com/document/d/doc/edit",
            },
          ],
        });
      throw new Error("Unexpected endpoint");
    }) as unknown as typeof fetch;
    const handler = createGoogleHandler({
      upsertFile: async (f) => {
        writes.push(f);
      },
    });
    const start = (await handler(
      new Request("http://localhost/auth/google/start"),
    ))!;
    expect(start.status).toBe(302);
    const destination = new URL(start.headers.get("location")!);
    const state = destination.searchParams.get("state")!;
    expect(destination.searchParams.get("code_challenge_method")).toBe("S256");
    const callback = (await handler(
      new Request(
        `http://localhost/auth/google/callback?state=${state}&code=synthetic-code`,
        { headers: { cookie: `orgflow_oauth_state=${state}` } },
      ),
    ))!;
    expect(callback.status).toBe(302);
    const sessionCookie = callback.headers
      .getSetCookie()
      .find((v) => v.startsWith("orgflow_google="))!
      .split(";")[0]!;
    expect(sessionCookie).not.toContain("private-test-token");
    const status = (await handler(
      new Request("http://localhost/api/integrations/google", {
        headers: { cookie: sessionCookie },
      }),
    ))!;
    expect(((await status.json()) as any).connected).toBe(true);
    const sync = (await handler(
      new Request("http://localhost/api/integrations/google/sync", {
        method: "POST",
        headers: { cookie: sessionCookie },
      }),
    ))!;
    expect(sync.status).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.originalPath).toBe("/Fundraising");
    expect(writes[0]).not.toHaveProperty("text");
    expect(
      (
        await handler(
          new Request(
            "http://localhost/auth/google/callback?state=" +
              state +
              "&code=replay",
            { headers: { cookie: `orgflow_oauth_state=${state}` } },
          ),
        )
      )?.status,
    ).toBe(400);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries({
      GOOGLE_CLIENT_ID: previous.id,
      GOOGLE_CLIENT_SECRET: previous.secret,
      GOOGLE_REDIRECT_URI: previous.redirect,
    }))
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  }
});
