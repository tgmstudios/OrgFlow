import { expect, test } from "bun:test";
import { createMemoryStore, seed } from "../../backend/store";
import { createApp } from "../../backend/app";

const URL="http://localhost";
const ORG="Centre Valley Community Pantry (OrgFlow Showcase)";
test("Showcase imports only for its own administrator, retains original documents and does not leak across organizations", async()=>{
 const store=createMemoryStore();
 await seed(store);
 const app=createApp(store);
 async function call(path:string,method="GET",json?:object,cookie?:string) {
  const r=await app(new Request(URL+path,{method,
   headers:{...(json?{"content-type":"application/json"}:{}),...(cookie?{cookie}:{})},
   ...(json?{body:JSON.stringify(json)}:{})}));
  return {status:r.status,headers:r.headers,data:await r.json()};
 }
 try{
  expect((await call("/api/showcase/install","POST",{confirmation:"INSTALL_FICTIONAL_SHOWCASE"})).status).toBe(401);
  const newAdmin=await call("/api/auth/signup","POST",{email:"staged-admin@example.org",name:"Staged Admin",password:"test-only-password",organization:ORG});
  expect(newAdmin.status).toBe(201);
  const adminCookie=newAdmin.headers.get("set-cookie")?.split(";")[0];
  expect(adminCookie).toBeTruthy();
  expect((await call("/api/showcase/install","POST",{confirmation:"oops"},adminCookie)).status).toBe(400);
  const workspace=await call("/api/org","GET",undefined,adminCookie);
  expect(workspace.data.name).toBe(ORG);
  expect(workspace.data.role).toBe("admin");
  const invite=workspace.data.inviteCode;
  const member=await call("/api/auth/signup","POST",{email:"staged-member@example.org",name:"Staged Member",password:"test-only-password",inviteCode:invite});
  expect(member.status).toBe(201);
  const memberCookie=member.headers.get("set-cookie")?.split(";")[0];
  expect((await call("/api/showcase/install","POST",{confirmation:"INSTALL_FICTIONAL_SHOWCASE"},memberCookie)).status).toBe(403);
  const invalidOrg=await call("/api/auth/signup","POST",{email:"other-admin@example.org",name:"Other Admin",password:"test-only-password",organization:"Unrelated Nonprofit"});
  expect(invalidOrg.status).toBe(201);
  const otherCookie=invalidOrg.headers.get("set-cookie")?.split(";")[0];
  expect((await call("/api/showcase/install","POST",{confirmation:"INSTALL_FICTIONAL_SHOWCASE"},otherCookie)).status).toBe(403);
  const load=await call("/api/showcase/install","POST",{confirmation:"INSTALL_FICTIONAL_SHOWCASE"},adminCookie);
  expect(load.status).toBe(200);
  expect(load.data.persons).toBe(5);
  expect(load.data.files).toBeGreaterThan(30);
  expect(load.data.indexedSources).toBe(26);
  const first=await call("/api/bootstrap","GET",undefined,adminCookie);
  expect(first.data.people).toHaveLength(5);
  expect(first.data.sources).toHaveLength(26);
  expect(first.data.files.length).toBeGreaterThan(30);
  const realPdf=first.data.files.find((f:any)=>f.name==="Maria_Reyes_Volunteer_Coordinator_Handoff.pdf");
  expect(realPdf.url).toContain("raw.githubusercontent.com");
  expect(realPdf.orgflowPath).toContain("People_And_Transfer");
  const maria=first.data.people.find((p:any)=>p.name==="Maria Reyes");
  expect(maria.managerId).toBe("showcase-sam");
  expect(maria.successorId).toBe("showcase-jordan");
  const source=first.data.sources.find((s:any)=>s.title==="Volunteer Welcome and First Shift");
  expect(source.ownerId).toBe("showcase-maria");
  expect((await call("/api/sources/"+source.id,"PATCH",{ownerId:"showcase-jordan"},adminCookie)).status).toBe(200);
  const repeat=await call("/api/showcase/install","POST",{confirmation:"INSTALL_FICTIONAL_SHOWCASE"},adminCookie);
  expect(repeat.status).toBe(200);
  const after=await call("/api/sources","GET",undefined,adminCookie);
  expect(after.data.sources.find((s:any)=>s.id===source.id).ownerId).toBe("showcase-jordan");
  const other=await call("/api/bootstrap","GET",undefined,otherCookie);
  expect(other.data.people).toHaveLength(0);
  expect(other.data.files).toHaveLength(0);
  expect(other.data.sources).toHaveLength(0);
 }finally{await store.close()}
});