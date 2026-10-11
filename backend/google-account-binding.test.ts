import { test, expect } from "bun:test";
import { createGoogleHandler } from "./google";

test("Google consent and tokens stay with the originating OrgFlow user and organization", async () => {
  const priorId = process.env.GOOGLE_CLIENT_ID, priorSecret = process.env.GOOGLE_CLIENT_SECRET;
  const originalFetch = globalThis.fetch;
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  let exchangeCount = 0;
  let revokeCount = 0;
  try {
    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        exchangeCount++;
        return Response.json({access_token:"never-expose-access",refresh_token:"never-expose-refresh",expires_in:3600});
      }
      if (url === "https://gmail.googleapis.com/gmail/v1/users/me/profile")
        return Response.json({emailAddress:"demo-test-account@example.org"});
      if (url === "https://oauth2.googleapis.com/revoke") {
        revokeCount++;
        return Response.json({ok:true});
      }
      throw new Error("Unexpected fetch");
    }) as typeof fetch;
    const google = createGoogleHandler({
      getAccount: async(req) => ({
        userId: req.headers.get("x-test-user") || "",
        orgId: req.headers.get("x-test-org") || "",
      }),
      upsertFile: async()=>{throw new Error("No files should be written");},
    });
    const make = (path:string, user:string, org:string, cookie = "", method = "GET") =>
      new Request("http://localhost"+path, {
        method, headers:{"x-test-user":user,"x-test-org":org,...(cookie?{cookie}:{})},
      });
    const first = (await google(make("/auth/google/start","user-A","org-A")))!;
    expect(first.status).toBe(302);
    const state = new URL(first.headers.get("location")!).searchParams.get("state")!;
    const callbackCookie = `orgflow_oauth_state=${state}`;
    const alienCallback=(await google(make(`/auth/google/callback?state=${state}&code=provided`,"user-B","org-A",callbackCookie)))!;
    expect(alienCallback.status).toBe(403);
    expect(exchangeCount).toBe(0);
    // A changed-account OAuth attempt must restart with a new one-time state.
    const next=(await google(make("/auth/google/start","user-A","org-A")))!;
    const state2=new URL(next.headers.get("location")!).searchParams.get("state")!;
    const ok=(await google(make(`/auth/google/callback?state=${state2}&code=provided`,"user-A","org-A",`orgflow_oauth_state=${state2}`)))!;
    expect(ok.status).toBe(302);
    const googleCookie=ok.headers.getSetCookie().find(x=>x.startsWith("orgflow_google="))!.split(";")[0]!;
    const connected=await google(make("/api/integrations/google","user-A","org-A",googleCookie));
    const connectedData=await connected!.json() as { connected: boolean; connectedEmail: string | null };
    expect(connectedData.connected).toBe(true);
    expect(connectedData.connectedEmail).toBe("demo-test-account@example.org");
    expect(JSON.stringify(connectedData)).not.toContain("never-expose");
    const otherUser=await google(make("/api/integrations/google","user-B","org-A",googleCookie));
    expect(((await otherUser!.json()) as any).connected).toBe(false);
    const otherOrg=await google(make("/api/integrations/google","user-A","org-B",googleCookie));
    expect(((await otherOrg!.json()) as any).connected).toBe(false);
    const otherSync=await google(make("/api/integrations/google/sync","user-B","org-A",googleCookie,"POST"));
    expect(otherSync?.status).toBe(401);
    const foreignDisconnect=await google(make("/api/integrations/google/disconnect","user-B","org-A",googleCookie,"POST"));
    expect(foreignDisconnect?.status).toBe(200);
    expect(revokeCount).toBe(0);
    expect(((await (await google(make("/api/integrations/google","user-A","org-A",googleCookie)))!.json()) as any).connected).toBe(true);
    const ownDisconnect=await google(make("/api/integrations/google/disconnect","user-A","org-A",googleCookie,"POST"));
    expect(ownDisconnect?.status).toBe(200);
    expect(revokeCount).toBe(1);
  } finally {
    globalThis.fetch = originalFetch;
    if (priorId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = priorId;
    if (priorSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = priorSecret;
  }
});
