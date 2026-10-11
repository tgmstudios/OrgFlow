import { test, expect } from "bun:test";
import { join } from "node:path";
import { createGoogleHandler } from "./google";
import { PDF_MIME, WORD_MIME } from "./document-text";

test("consented Drive indexing reads complete PDF and Word sources with citations", async () => {
  const oldId = process.env.GOOGLE_CLIENT_ID;
  const oldSecret = process.env.GOOGLE_CLIENT_SECRET;
  const oldFetch = globalThis.fetch;
  const folder = join(import.meta.dir, "../demo-content/01_Google_Drive/Operations");
  const pdf = await Bun.file(join(folder, "Volunteer_Welcome_and_First_Shift.pdf")).arrayBuffer();
  const word = await Bun.file(join(folder, "Volunteer_Welcome_and_First_Shift.docx")).arrayBuffer();
  const indexed: any[] = [];
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  try {
    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token")
        return Response.json({access_token:"test-access",expires_in:3600});
      if (url.endsWith("/users/me/profile"))
        return Response.json({emailAddress:"demo@example.org"});
      if (url.startsWith("https://www.googleapis.com/drive/v3/files?") && !url.includes("alt=media"))
        return Response.json({
          files: [
            {id:"pdf-original",mimeType:PDF_MIME,name:"Volunteer_Welcome_and_First_Shift.pdf",modifiedTime:"2026-10-11T10:00:00Z",webViewLink:"https://drive.google.com/file/d/pdf-original/view"},
            {id:"word-original",mimeType:WORD_MIME,name:"Volunteer_Welcome_and_First_Shift.docx",modifiedTime:"2026-10-10T10:00:00Z",webViewLink:"https://drive.google.com/file/d/word-original/view"},
          ],
        });
      if (url.includes("/files/pdf-original?alt=media")) return new Response(pdf);
      if (url.includes("/files/word-original?alt=media")) return new Response(word);
      throw Error("Unexpected Google API mock route");
    }) as typeof fetch;

    const google = createGoogleHandler({
      upsertFile: async() => {},
      saveSource: async (source) => { indexed.push(source); },
    });
    const authStart = (await google(new Request("http://localhost/auth/google/start")))!;
    expect(authStart.status).toBe(302);
    const state = new URL(authStart.headers.get("location")!).searchParams.get("state")!;
    const callback = (await google(new Request(`http://localhost/auth/google/callback?state=${state}&code=sample`, {
      headers:{cookie:`orgflow_oauth_state=${state}`},
    })))!;
    expect(callback.status).toBe(302);
    const c = callback.headers.getSetCookie().find(x=>x.startsWith("orgflow_google="))!.split(";")[0]!;
    const noConsent = (await google(new Request("http://localhost/api/integrations/google/index",{
      method:"POST",headers:{cookie:c},body:JSON.stringify({drive:true,gmail:false,consent:false}),
    })))!;
    expect(noConsent.status).toBe(400);
    const response = (await google(new Request("http://localhost/api/integrations/google/index",{
      method:"POST",headers:{cookie:c},body:JSON.stringify({drive:true,gmail:false,consent:true}),
    })))!;
    expect(response.status).toBe(200);
    const result = (await response.json()) as { indexed: {drive:number,gmail:number} };
    expect(result.indexed.drive).toBe(2);
    expect(result.indexed.gmail).toBe(0);
    expect(indexed).toHaveLength(2);
    expect(indexed.every(s=>s.text.includes("8:30"))).toBe(true);
    expect(indexed.every(s=>s.url.startsWith("https://drive.google.com/"))).toBe(true);
    expect(indexed.every(s=>!s.text.includes("%PDF-"))).toBe(true);
    expect(indexed.some(s=>s.id==="drive-pdf-original")).toBe(true);
    expect(indexed.some(s=>s.id==="drive-word-original")).toBe(true);
  } finally {
    globalThis.fetch = oldFetch;
    if(oldId === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID=oldId;
    if(oldSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET; else process.env.GOOGLE_CLIENT_SECRET=oldSecret;
  }
});
