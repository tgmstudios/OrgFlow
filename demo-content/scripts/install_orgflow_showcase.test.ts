import { describe, expect, test } from "bun:test";
import { createMemoryStore, seed } from "../../backend/store";
import { createApp } from "../../backend/app";
import { runInOrg, scopedStore } from "../../backend/workspace";
import { installShowcase } from "./install_orgflow_showcase";
import { rank } from "../../backend/retrieval";

const ORG = "a11ce111-aaaa-4444-8888-000000000001";
const WRONG = "b11ce222-bbbb-4444-8888-000000000002";
const NAME = "Centre Valley Community Pantry (OneFlow Showcase)";
async function fixture() {
  const store = createMemoryStore();
  await seed(store);
  await store.put("orgs",{id:ORG,name:NAME,createdAt:"2026-10-11T12:00:00Z"});
  await store.put("orgs",{id:WRONG,name:"Real customer",createdAt:"2026-10-11T12:00:00Z"});
  const app=createApp(store,{requireAuth:false});
  const call = async(path:string,method="GET",body?:object)=>{
    const res=await app(new Request("http://localhost"+path, {
      method,...(body?{body:JSON.stringify(body),headers:{"content-type":"application/json"}}:{})
    }));
    return {status:res.status,body:await res.json()};
  };
  return {store,call};
}
test("rejects shared workspace and unrelated organizations",async()=>{
  const {store}=await fixture();
  try {
    await expect(installShowcase(store,"default",{apply:true})).rejects.toThrow("Refusing");
    await expect(installShowcase(store,WRONG,{apply:true})).rejects.toThrow("Organization must");
    const empty = await runInOrg(WRONG,async()=>scopedStore(store).list("people"));
    expect(empty).toEqual([]);
  }finally{await store.close()}
});
test("imports all documents, indexed sources, roles and real linked PDFs into isolated workspace",async()=>{
  const {store}=await fixture();
  try {
    const dry=await installShowcase(store,ORG,{apply:false});
    expect(dry.mode).toBe("dry-run");
    expect(dry.persons).toBe(5);
    expect(dry.articles).toBe(11);
    const stillEmpty=await runInOrg(ORG,async()=>scopedStore(store).list("people"));
    expect(stillEmpty).toEqual([]);
    const result=await installShowcase(store,ORG,{apply:true});
    expect(result.files).toBeGreaterThan(30);
    expect(result.indexedSources).toBe(26);
    expect(result.emails).toBe(9);
    expect(result.calendarEvents).toBe(11);
    const info=await runInOrg(ORG,async()=>{
      const s=scopedStore(store);
      return {
        people:await s.list("people"),
        files:await s.list("files"),
        sources:await s.list("sources"),
        chunks:await s.list("chunks"),
        articles:await s.list("articles"),
        events:await s.list("events"),
      };
    });
    expect(info.people).toHaveLength(5);
    expect(info.articles).toHaveLength(11);
    expect(info.events).toHaveLength(11);
    expect(info.events.every(e=>!Number.isNaN(Date.parse(String(e.start))))).toBe(true);
    expect(info.events.some(e=>String(e.start).includes("T15:30"))).toBe(true);
    expect(info.sources).toHaveLength(26);
    expect(info.chunks.length).toBeGreaterThan(26);
    expect(info.articles.every(a=>a.status==="draft")).toBe(true);
    expect(info.people.find(p=>p.id==="showcase-maria")?.managerId).toBe("showcase-sam");
    expect(info.people.find(p=>p.id==="showcase-maria")?.successorId).toBe("showcase-jordan");
    expect(info.people.find(p=>p.id==="showcase-priya")?.managerId).toBe("showcase-maya");
    const pdfs=info.files.filter(f=>f.name.endsWith(".pdf"));
    expect(pdfs).toHaveLength(13);
    expect(pdfs.every(f=>String(f.url).startsWith("https://raw.githubusercontent.com/"))).toBe(true);
    expect(pdfs.some(f=>String(f.orgflowPath).includes("/People_And_Transfer/"))).toBe(true);
    expect(info.sources.some(s=>s.ownerId==="showcase-maria"&&s.title==="Volunteer Welcome and First Shift")).toBe(true);
    const welcome=info.chunks.filter(c=>String(c.title).includes("Volunteer Welcome"));
    expect(welcome.map(c=>c.text).join("\n")).toContain("8:30 a.m.");
    const matches=rank("what time do first time volunteers arrive?",info.chunks,c=>String(c.title)+" "+String(c.text),6);
    expect(matches.some(c=>String(c.title).includes("Volunteer Welcome") && String(c.text).includes("8:30"))).toBe(true);
    expect(info.sources.every(s=>s.synthetic===true)).toBe(true);

    await runInOrg(ORG,async()=>{
      const s=scopedStore(store);
      const maria=(await s.get("people","showcase-maria"))!;
      await s.put("people",{...maria,role:"Volunteer Coordinator (reviewed)"});
      const firstFile=info.files[0]!;
      await s.put("files",{...firstFile,orgflowPath:"/Edited by a human"});
    });
    const repeat=await installShowcase(store,ORG,{apply:true});
    const reviewed=await runInOrg(ORG,async()=>{
      const s=scopedStore(store);
      return {maria:await s.get("people","showcase-maria"),file:await s.get("files",info.files[0]!.id)};
    });
    expect(reviewed.maria?.role).toBe("Volunteer Coordinator (reviewed)");
    expect(reviewed.file?.orgflowPath).toBe("/Edited by a human");
    expect(repeat.mode).toBe("applied");
    const articles=await runInOrg(ORG,async()=>scopedStore(store).list("articles"));
    expect(articles).toHaveLength(11);
    const anotherOrg=await runInOrg(WRONG,async()=>({
      files:await scopedStore(store).list("files"),
      sources:await scopedStore(store).list("sources"),
    }));
    expect(anotherOrg.files).toHaveLength(0);
    expect(anotherOrg.sources).toHaveLength(0);
  }finally{await store.close()}
});
test("People reporting lines validate existence, self-supervision and cycles",async()=>{
  const {store,call}=await fixture();
  try {
    const sam:any=await call("/api/people","POST",{name:"Sam",role:"Director"});
    expect(sam.status).toBe(201);
    const maria:any=await call("/api/people","POST",{name:"Maria",role:"Coordinator",managerId:sam.body.id});
    expect(maria.status).toBe(201);
    expect(maria.body.managerId).toBe(sam.body.id);
    expect((await call("/api/people","POST",{name:"J",role:"Staff",managerId:"missing"})).status).toBe(400);
    expect((await call("/api/people/"+sam.body.id,"PATCH",{managerId:sam.body.id})).status).toBe(400);
    expect((await call("/api/people/"+sam.body.id,"PATCH",{managerId:maria.body.id})).status).toBe(400);
    const clear:any=await call("/api/people/"+maria.body.id,"PATCH",{managerId:""});
    expect(clear.status).toBe(200);
    expect(clear.body.managerId).toBeUndefined();
  }finally{await store.close()}
});
