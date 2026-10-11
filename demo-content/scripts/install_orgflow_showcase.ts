/**
 * Stage the complete fictional OrgFlow showcase into a dedicated existing organization.
 *
 * Dry run by default. Apply only to a named, isolated organization.
 * Never seeds the shared "default" workspace or creates login credentials.
 *
 * Examples:
 * bun demo-content/scripts/install_orgflow_showcase.ts --org=UUID --production
 * bun demo-content/scripts/install_orgflow_showcase.ts --org=UUID --production --apply
 *
 * Connects to the PostgreSQL backend through DATABASE_URL in its environment.
 * Tests use createMemoryStore() and do not contact a production database.
 *
 * The production mode reads DATABASE_URL or SQLITE_PATH from its own process
 * environment. This script prints neither secrets nor original document text.
 */
import { join, relative, basename, extname } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { openStore, type Store } from "../../backend/store";
import { runInOrg, scopedStore, DEFAULT_ORG } from "../../backend/workspace";
import { createOperations } from "../../backend/operations";

const ROOT = new URL("../", import.meta.url).pathname;
const DRIVE = join(ROOT, "01_Google_Drive");
const MAIL = join(ROOT, "02_Gmail_Examples");
const REV = "ca04f40";
const GITHUB = `https://raw.githubusercontent.com/tgmstudios/c0mpiled/${REV}/demo-content/`;
const SHOWCASE_ORGANIZATIONS = new Set([
  "Center Valley Community Pantry (OrgFlow Showcase)",
  "Centre Valley Community Pantry (OrgFlow Showcase)", // Workspaces created before the spelling fix
]);

type PersonSeed = {
  id: string;
  name: string;
  role: string;
  status: "active" | "leaving";
  managerId?: string;
  leaveDate?: string;
  successorId?: string;
};
const people: PersonSeed[] = [
  { id: "showcase-sam", name: "Sam Rivera", role: "Operations Manager", status: "active" },
  { id: "showcase-maya", name: "Maya Chen", role: "Development Director", status: "leaving", leaveDate: "2026-11-15", successorId: "showcase-priya" },
  { id: "showcase-priya", name: "Priya Patel", role: "Development Associate", status: "active", managerId: "showcase-maya" },
  { id: "showcase-maria", name: "Maria Reyes", role: "Volunteer Coordinator", status: "leaving", managerId: "showcase-sam", leaveDate: "2026-10-31", successorId: "showcase-jordan" },
  { id: "showcase-jordan", name: "Jordan Lee", role: "Incoming Volunteer Coordinator", status: "active", managerId: "showcase-sam" },
];
const CATEGORIES: [string,string][] = [
  ["showcase-cat-operations", "Operations & volunteer support"],
  ["showcase-cat-development", "Development & grant reporting"],
  ["showcase-cat-programs", "Programs & events"],
  ["showcase-cat-governance", "Governance"],
  ["showcase-cat-people", "People & handoffs"],
];
function tagFor(path: string): { categoryId: string, ownerId: string } {
  if (path.includes("People_And_Transfer/Maria_")) return { categoryId:"showcase-cat-people", ownerId:"showcase-maria" };
  if (path.includes("People_And_Transfer/Maya_")) return { categoryId:"showcase-cat-people", ownerId:"showcase-maya" };
  if (path.includes("People_And_Transfer/")) return { categoryId:"showcase-cat-people", ownerId:"showcase-sam" };
  if (path.includes("Development/")) return { categoryId:"showcase-cat-development", ownerId:"showcase-maya" };
  if (path.includes("Governance/")) return { categoryId:"showcase-cat-governance", ownerId:"showcase-sam" };
  if (path.includes("Programs/Harvest")) return { categoryId:"showcase-cat-programs", ownerId:"showcase-maya" };
  if (path.includes("Programs/")) return { categoryId:"showcase-cat-programs", ownerId:"showcase-sam" };
  if (path.includes("Operations/Building")) return { categoryId:"showcase-cat-operations", ownerId:"showcase-sam" };
  return { categoryId:"showcase-cat-operations", ownerId:"showcase-maria" };
}
function slug(path: string) {
  return Buffer.from(path).toString("base64url").slice(0, 190);
}
const shaName = (s: string) => s.replace(/\.(md|txt|pdf|docx|csv|png)$/i, "").replaceAll("_"," ");
function doc(title: string, body: string) {
  return {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type:"text", text:title }] },
      ...body.split(/\n\n+/).filter(Boolean).slice(0,80).map((p) => ({
        type: "paragraph",
        content: [{ type: "text", text: p.replace(/^#+ /gm,"").replace(/\n/g," ").slice(0,2600) }],
      })),
    ],
  };
}
async function recursiveFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const p = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await recursiveFiles(p));
    else if (entry.isFile()) files.push(p);
  }
  return files.sort();
}

export async function installShowcase(store: Store, orgId: string, options: { apply: boolean }): Promise<{
  orgId: string;
  persons: number;
  files: number;
  indexedSources: number;
  articles: number;
  emails: number;
  calendarEvents: number;
  mode: "applied" | "dry-run";
}> {
  if (!orgId || orgId === DEFAULT_ORG || !/^[a-f\d-]{36}$/i.test(orgId))
    throw new Error("Refusing to import into default or invalid organization.");
  const org = await store.get("orgs", orgId);
  if (!org || !SHOWCASE_ORGANIZATIONS.has(String(org.name)))
    throw new Error("Organization must have exact name Center Valley Community Pantry (OrgFlow Showcase); refusing to modify another workspace.");
  const allFiles = await recursiveFiles(DRIVE);
  const listed = allFiles.filter((p) => ["pdf","docx","md","csv","png"].includes(extname(p).slice(1)));
  const sources = allFiles.filter((p) => [".md",".csv"].includes(extname(p)));
  const examples = (await recursiveFiles(MAIL)).filter((p)=>p.endsWith(".txt"));
  const ICS = join(ROOT,"03_Event_Calendar/OrgFlow_Example_Calendar.ics");
  const calendarText = await readFile(ICS,"utf8");
  const countEvents = (calendarText.match(/BEGIN:VEVENT/g) || []).length;

  if (options.apply) {
    await runInOrg(orgId, async () => {
      const scoped = scopedStore(store);
      for (const [id, name] of CATEGORIES) {
        const existing = await scoped.get("categories",id);
        if (!existing) await scoped.put("categories",{ id, name, synthetic:true });
      }
      for (const person of people) {
        const original = await scoped.get("people",person.id);
        if (original && !original.synthetic) throw new Error("Refusing to overwrite an actual staff member.");
        if (original) continue; // preserve corrections and real supervisor updates
        await scoped.put("people",{...person, synthetic:true, createdAt:"2026-10-11T20:00:00.000Z"});
      }
      const op = createOperations({
        store: scoped,
        agent: async () => Response.json({ error:"Demo import never invokes AI" },{status:503}),
        currentUser: async () => null,
      });
      for (const p of listed) {
        const rel = relative(DRIVE,p).replaceAll("\\","/");
        const srcRel = `01_Google_Drive/${rel}`;
        const originalPath = "/"+srcRel.replace(/^01_Google_Drive\//,"");
        const id = "showcase-file-"+slug(rel);
        const old = await scoped.get("files",id);
        if (old && !old.synthetic) throw new Error("Refusing to replace non-demo file");
        if (old) continue; // preserve user's organizational folder changes
        await scoped.put("files", {
          id, synthetic:true, name:basename(p),
          provider:"OrgFlow Showcase",
          originalPath,
          orgflowPath:"/OrgFlow Showcase"+originalPath,
          url:GITHUB+srcRel.split("/").map(encodeURIComponent).join("/"),
          type:extname(p).slice(1),
          updatedAt:"2026-10-11T21:00:00.000Z",
          ownerId:tagFor(rel).ownerId,
        });
      }
      for (const p of sources) {
        const rel = relative(DRIVE,p).replaceAll("\\","/");
        const {ownerId} = tagFor(rel);
        const id = "showcase-source-"+slug(rel);
        const before = await scoped.get("sources",id);
        if (before && !before.synthetic) throw new Error("Refusing to replace a real indexed source.");
        if (before) continue; // preserve reassignment and indexed source version
        await op.saveSource({
          id, title: shaName(basename(p)), provider:"OrgFlow Showcase",
          text:(await readFile(p,"utf8")).slice(0,45000),
          url:GITHUB+(`01_Google_Drive/${rel}`).split("/").map(encodeURIComponent).join("/"),
          updatedAt:"2026-10-11T21:00:00.000Z",
        });
        await scoped.put("sources",{...(await scoped.get("sources",id))!, ownerId, synthetic:true });
      }
      for (const p of examples) {
        const rel = relative(MAIL,p).replaceAll("\\","/");
        const id = "showcase-mail-"+slug(rel);
        const original = await scoped.get("sources",id);
        if (original && !original.synthetic) throw new Error("Refusing to replace a real indexed message.");
        if (original) continue;
        const body=await readFile(p,"utf8");
        await op.saveSource({
          id, title: shaName(basename(p)), provider:"Demo Mail",
          text:body.slice(0,45000),
          from:(body.match(/From: (.+)/)||[])[1] || "",
          url:GITHUB+(`02_Gmail_Examples/${rel}`).split("/").map(encodeURIComponent).join("/"),
          updatedAt:"2026-10-11T21:00:00.000Z",
        });
        const from = (body.match(/From: (.+)/)||[])[1] || "";
        const author = people.find((p)=>from.includes(p.name));
        await scoped.put("sources",{...(await scoped.get("sources",id))!, ownerId:author?.id, synthetic:true });
      }
      const markdown = allFiles.filter((p)=>p.endsWith(".md"));
      for(const p of markdown) {
        const rel=relative(DRIVE,p).replaceAll("\\","/");
        const {categoryId,ownerId}=tagFor(rel);
        const body = await readFile(p,"utf8");
        const title=body.match(/^# (.+)$/m)?.[1] ?? shaName(basename(p));
        const id="showcase-article-"+slug(rel);
        const original = await scoped.get("articles",id);
        if (original && !original.synthetic) throw new Error("Refusing to replace a real article.");
        // Never overwrite human edits or publication in a previous showcase import.
        if (original) continue;
        await scoped.put("articles",{
          id, synthetic:true, title, categoryId, ownerId,
          content:doc(title,body),status:"draft",
          sources:[{id:"showcase-source-"+slug(rel),title,url:GITHUB+"01_Google_Drive/"+rel}],
          updatedAt:"2026-10-11T21:00:00.000Z",
          reviewDueAt:"2027-01-11T21:00:00.000Z",
        });
      }
      // Calendar fixtures are synthetic events, never an external Google Calendar integration.
      let i=0;
      for(const block of calendarText.split("BEGIN:VEVENT").slice(1)) {
        const field=(key:string)=>block.match(new RegExp("^"+key+"(?:;[^:]*)?:(.*)$","m"))?.[1]?.trim() ?? "";
        const title=field("SUMMARY"),when=field("DTSTART");
        if(!when) continue;
        const compact=when.replace(/[^\d]/g,"");
        const start = `${compact.slice(0,4)}-${compact.slice(4,6)}-${compact.slice(6,8)}T${compact.slice(8,10)}:${compact.slice(10,12)}:00-04:00`;
        if (Number.isNaN(Date.parse(start))) throw new Error("Invalid example calendar event");
        const eventId=`showcase-event-${++i}`;
        if (await scoped.get("events",eventId)) continue;
        await scoped.put("events",{
          id:eventId,
          synthetic:true,title, start, kind:"deadline",
          ownerId:title.toLowerCase().includes("volunteer")?"showcase-jordan":"showcase-sam",
        });
      }
    });
  }
  return {orgId,persons:people.length,files:listed.length,
    indexedSources:sources.length+examples.length,articles:allFiles.filter(p=>p.endsWith(".md")).length,
    emails:examples.length,calendarEvents:countEvents,
    mode:options.apply?"applied":"dry-run"};
}
if(import.meta.main) {
  const flag=(k:string)=>process.argv.find(a=>a.startsWith(k+"="))?.slice(k.length+1);
  const orgId=flag("--org");
  const production=process.argv.includes("--production");
  const apply=process.argv.includes("--apply");
  if(!orgId || !production || !process.env.DATABASE_URL){
    console.error("Usage: DATABASE_URL=<set locally> bun install_orgflow_showcase.ts --org=UUID --production [--apply]");
    process.exit(2);
  }
  const store=await openStore();
  try {console.log(JSON.stringify(await installShowcase(store,orgId,{apply}),null,2))}
  finally {await store.close()}
}
