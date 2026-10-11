import { readFile } from "node:fs/promises";
import type { Store } from "./store";
import { createOperations } from "./operations";

/**
 * Sample content for the shared demo workspace (organization "default") so Ask, checklists, ownership,
 * review and Transfer can be shown end to end. Every item is `synthetic: true` and labelled as a sample
 * in the UI. Added once per version (meta "samples-v1" to "samples-v3"); staff edits are never overwritten.
 * New organizations created at sign-up start empty and never receive these.
 */
const text = (t: string) => ({ type: "text", text: t });
const p = (t: string) => ({ type: "paragraph", content: [text(t)] });
const h = (t: string) => ({ type: "heading", attrs: { level: 2 }, content: [text(t)] });
const steps = (items: string[]) => ({
  type: "orderedList",
  content: items.map((t) => ({ type: "listItem", content: [p(t)] })),
});
const doc = (...content: unknown[]) => ({ type: "doc", content });

// Showcase documents (fictional Center Valley Community Pantry) indexed into the demo workspace: the ones in
// Maria Reyes's handoff story. Originals open from the team repository, the same links the importer uses.
const SHOWCASE_ROOT = new URL("../demo-content/", import.meta.url).pathname;
const SHOWCASE_URL = "https://raw.githubusercontent.com/tgmstudios/c0mpiled/ca04f40/demo-content/";
const showcaseUrl = (path: string) => SHOWCASE_URL + path.split("/").map(encodeURIComponent).join("/");
const showcaseId = (kind: "source" | "mail", rel: string) =>
  `showcase-${kind}-${Buffer.from(rel).toString("base64url").slice(0, 190)}`;
function showcaseRef(rel: string, title: string) {
  return { id: showcaseId("source", rel), title, url: showcaseUrl("01_Google_Drive/" + rel), synthetic: true };
}
const SHOWCASE_DOCS: { rel: string; title: string; ownerId: string; pdf?: boolean }[] = [
  { rel: "Operations/Volunteer_Welcome_and_First_Shift.md", title: "Volunteer Welcome and First Shift", ownerId: "person-maria", pdf: true },
  { rel: "Operations/Monthly_Volunteer_Scheduling.md", title: "Monthly Volunteer Scheduling", ownerId: "person-maria", pdf: true },
  { rel: "Operations/Volunteer_Availability_October.csv", title: "Volunteer Availability October", ownerId: "person-maria" },
  { rel: "People_And_Transfer/Maria_Reyes_Volunteer_Coordinator_Handoff.md", title: "Maria Reyes Volunteer Coordinator Handoff", ownerId: "person-maria", pdf: true },
  { rel: "Operations/Building_Safety_and_Cold_Chain.md", title: "Building Safety and Cold Chain", ownerId: "person-sam", pdf: true },
  { rel: "Programs/Quarterly_Impact_Snapshot.md", title: "Quarterly Impact Snapshot", ownerId: "person-sam", pdf: true },
  { rel: "Programs/Outcomes_Jul_Sep.csv", title: "Outcomes Jul Sep", ownerId: "person-sam" },
];
const SHOWCASE_MAIL: { rel: string; title: string; ownerId: string }[] = [
  { rel: "01_Welcome_to_Your_First_Shift.txt", title: "Welcome to Your First Shift", ownerId: "person-sam" },
  { rel: "02_October_Schedule_Reminder.txt", title: "October Schedule Reminder", ownerId: "person-sam" },
  { rel: "08_Superseded_Arrival_Time.txt", title: "Superseded Arrival Time", ownerId: "person-sam" },
  { rel: "09_Maria_to_Jordan_Handoff.txt", title: "Maria to Jordan Handoff", ownerId: "person-maria" },
];

// The demo story follows the showcase corpus (demo-content/): Maria Reyes, Volunteer Coordinator for six
// years, is leaving; Sam Rivera supervises the volunteer program.
const people = [
  { id: "person-maria", name: "Maria Reyes", role: "Volunteer Coordinator", email: "maria@example.org", status: "leaving", leaveDate: "2026-10-31", managerId: "person-sam" },
  { id: "person-sam", name: "Sam Rivera", role: "Operations Manager", email: "sam@example.org", status: "active" },
  { id: "person-priya", name: "Priya Patel", role: "Development Associate", email: "priya@example.org", status: "active" },
];

const articles = [
  {
    id: "article-welcome",
    title: "Donor thank-you process",
    categoryId: "cat-stewardship",
    ownerId: "person-priya",
    content: doc(
      p("Sample: every gift gets a personal thank-you within two working days. Replace with your organization's approved process."),
      h("Steps"),
      steps([
        "Record the gift in the donor database the same day, including campaign and designation.",
        "Send the tax receipt automatically from the database within 24 hours.",
        "Write a personal thank-you email or card within two working days; gifts over $1,000 get a call from the Development Director.",
        "Log the thank-you in the donor record with the date and channel.",
        "Add the donor to the next impact-update mailing.",
      ]),
      h("Review questions"),
      p("Who covers thank-you calls when the Development Director is out?"),
    ),
  },
  {
    id: "article-grant-report",
    title: "Quarterly grant report submission",
    categoryId: "cat-stewardship",
    ownerId: "person-priya",
    content: doc(
      p("Sample: how quarterly reports reach funders on time."),
      h("Steps"),
      steps([
        "Three weeks before the due date, pull program numbers from the outcomes spreadsheet.",
        "Ask program leads for one client story each (with consent on file).",
        "Draft the narrative in the funder's template; finance adds the budget-to-actual table.",
        "Executive Director reviews and signs off one week before the deadline.",
        "Submit through the funder portal and save the confirmation in the grant's Drive folder.",
      ]),
    ),
  },
  {
    id: "article-volunteer-schedule",
    title: "Monthly volunteer scheduling",
    categoryId: "cat-operations",
    ownerId: "person-maria",
    content: doc(
      p("Sample: building next month's volunteer schedule. Distribution runs Wednesday and Friday, 9:00 a.m. to noon."),
      h("Steps"),
      steps([
        "On the 12th, prepare next month's availability request and check the active roster.",
        "By the 15th, send the availability form to active volunteers and record responses.",
        "On the 18th, follow up with shift leads and review missing coverage.",
        "By the 22nd, publish the draft schedule: trained shift leads first, then returning volunteers, then newcomers with a buddy.",
        "Send confirmations with arrival times (shift lead 8:15, new volunteers 8:30, returning 8:45) and parking details.",
        "Two days before each shift, send a reminder; fill cancellations from the waitlist and tell Sam Rivera about any remaining gap.",
      ]),
      h("Review questions"),
      p("With fewer than five confirmed volunteers, who decides whether to consolidate stations?"),
    ),
    sources: [showcaseRef("Operations/Monthly_Volunteer_Scheduling.md", "Monthly Volunteer Scheduling")],
  },
  {
    id: "article-volunteer-welcome",
    title: "Volunteer welcome and first shift",
    categoryId: "cat-operations",
    ownerId: "person-maria",
    content: doc(
      p("Sample: one consistent first shift for every new volunteer. New volunteers arrive by 8:30 a.m. at the blue welcome table; returning volunteers at 8:45 a.m."),
      h("Steps"),
      steps([
        "Two days before, send the welcome email: date, side entrance, parking beside the blue loading door, closed-toe shoes.",
        "Greet the new volunteer at the blue welcome table at 8:30 a.m. and introduce an experienced buddy.",
        "Point out handwashing, washrooms, first aid and emergency exits; explain privacy and the no-photo rule.",
        "Demonstrate one assigned station and let them practice with support; check in halfway and offer a break.",
        "At the end, ask what was unclear, record one improvement idea and offer the next-shift sign-up link.",
        "Record orientation date, station, buddy and completion in the volunteer register.",
      ]),
      h("Review questions"),
      p("Who greets new volunteers when the coordinator is not on shift?"),
    ),
    sources: [showcaseRef("Operations/Volunteer_Welcome_and_First_Shift.md", "Volunteer Welcome and First Shift")],
  },
  {
    id: "article-onboarding",
    title: "New staff first week",
    categoryId: "cat-people",
    ownerId: "person-sam",
    content: doc(
      p("Sample: what every new staff member does in their first week."),
      h("Checklist"),
      steps([
        "Day 1: accounts (email, Drive, donor database) and building access.",
        "Day 1: meet your manager and read this knowledge base's published playbooks for your role.",
        "Day 2: shadow a colleague on one recurring process.",
        "Day 3: review the organization's confidentiality and donor-data policy.",
        "Day 5: check in with your manager on questions and open items.",
      ]),
    ),
  },
];

/** A sample article nobody has edited since it was seeded. */
const pristine = (a: any) => a?.synthetic === true && a.publishedBy?.id === "sample" && a.status === "published";

export async function seedSamples(store: Store) {
  if (!(await store.get("meta", "samples-v1"))) await seedBase(store);
  if (!(await store.get("meta", "samples-v2"))) await upgradeToShowcaseStory(store);
  if (!(await store.get("meta", "samples-v3"))) await refreshShowcaseText(store);
}

async function publishSample(store: Store, article: (typeof articles)[number], now: string) {
  await store.put("articles", {
    ...article,
    synthetic: true,
    status: "published",
    publishedTitle: article.title,
    publishedContent: article.content,
    publishedCategoryId: article.categoryId,
    publishedSources: article.sources,
    publishedBy: { id: "sample", name: "Sample data" },
    publishedAt: now,
    reviewDueAt:
      article.id === "article-grant-report"
        ? new Date(Date.now() - 3 * 86400000).toISOString()
        : new Date(Date.now() + 60 * 86400000).toISOString(),
    updatedAt: now,
  });
}

async function seedBase(store: Store) {
  const now = new Date().toISOString();
  for (const person of people)
    if (!(await store.get("people", person.id)))
      await store.put("people", { ...person, synthetic: true, createdAt: now });
  for (const article of articles) {
    const current = await store.get("articles", article.id);
    // Only replace the original one-paragraph seed article, never staff-edited content.
    const untouched =
      current?.synthetic === true && JSON.stringify(current.content).length < 400;
    if (current && !untouched) continue;
    await publishSample(store, article, now);
  }
  await store.put("meta", { id: "samples-v1", version: 1 });
}

/**
 * v2: the demo story moves from Maya Chen to Maria Reyes (matching the showcase corpus) and Maria's
 * documents are indexed so Ask can cite them and the Knowledge map shows what she holds. Only records that
 * are still untouched samples change.
 */
async function upgradeToShowcaseStory(store: Store) {
  const now = new Date().toISOString();
  const maya = await store.get("people", "person-maya");
  if (maya?.synthetic === true && maya.name === "Maya Chen") {
    await store.delete("people", "person-maya");
    for (const article of await store.list("articles"))
      if (article.synthetic === true && article.ownerId === "person-maya")
        await store.put("articles", { ...article, ownerId: "person-priya" });
  }
  for (const person of people) {
    const current = await store.get("people", person.id);
    if (!current) await store.put("people", { ...person, synthetic: true, createdAt: now });
  }
  const jordan = await store.get("people", "person-jordan");
  if (jordan?.synthetic === true && jordan.name === "Jordan Lee") await store.delete("people", "person-jordan");
  for (const article of articles) {
    const current = await store.get("articles", article.id);
    if (!current || (pristine(current) && ["article-volunteer-schedule", "article-volunteer-welcome"].includes(article.id)))
      await publishSample(store, article, now);
  }
  const operations = createOperations({
    store,
    agent: async () => Response.json({ error: "Samples never call AI" }, { status: 503 }),
    currentUser: async () => null,
  });
  const index = async (id: string, title: string, provider: string, path: string, ownerId: string, from?: string) => {
    if (await store.get("sources", id)) return;
    const text = await readFile(SHOWCASE_ROOT + path, "utf8").catch(() => "");
    if (!text) return;
    await operations.saveSource({ id, title, provider, text: text.slice(0, 45000), url: showcaseUrl(path), from, updatedAt: now });
    await store.put("sources", { ...(await store.get("sources", id))!, ownerId, synthetic: true });
  };
  for (const d of SHOWCASE_DOCS) {
    await index(showcaseId("source", d.rel), d.title, "OrgFlow Showcase", "01_Google_Drive/" + d.rel, d.ownerId);
    if (!d.pdf) continue;
    const pdf = d.rel.replace(/\.md$/, ".pdf");
    const fileId = "showcase-file-" + Buffer.from(pdf).toString("base64url").slice(0, 190);
    if (!(await store.get("files", fileId)))
      await store.put("files", {
        id: fileId,
        synthetic: true,
        name: pdf.split("/").pop(),
        provider: "OrgFlow Showcase",
        originalPath: "/" + pdf,
        orgflowPath: "/OrgFlow Showcase/" + pdf,
        url: showcaseUrl("01_Google_Drive/" + pdf),
        type: "pdf",
        updatedAt: now,
        ownerId: d.ownerId,
      });
  }
  for (const m of SHOWCASE_MAIL) {
    const path = "02_Gmail_Examples/" + m.rel;
    const from = ((await readFile(SHOWCASE_ROOT + path, "utf8").catch(() => "")).match(/From: (.+)/) || [])[1];
    await index(showcaseId("mail", m.rel), m.title, "Demo Mail", path, m.ownerId, from);
  }
  await store.put("meta", { id: "samples-v2", version: 2 });
}

/**
 * v3: the showcase corpus was respelled ("Center Valley") and its PDFs rebuilt. Re-index the showcase
 * sources still marked synthetic and repoint sample links at the current corpus revision. Owners are kept.
 */
async function refreshShowcaseText(store: Store) {
  const now = new Date().toISOString();
  const operations = createOperations({
    store,
    agent: async () => Response.json({ error: "Samples never call AI" }, { status: 503 }),
    currentUser: async () => null,
  });
  const refresh = async (id: string, path: string) => {
    const current = await store.get("sources", id);
    if (current?.synthetic !== true) return;
    const text = await readFile(SHOWCASE_ROOT + path, "utf8").catch(() => "");
    if (!text) return;
    await operations.saveSource({ ...current, text: text.slice(0, 45000), url: showcaseUrl(path), updatedAt: now });
    await store.put("sources", { ...(await store.get("sources", id))!, ownerId: current.ownerId, synthetic: true });
  };
  for (const d of SHOWCASE_DOCS) await refresh(showcaseId("source", d.rel), "01_Google_Drive/" + d.rel);
  for (const m of SHOWCASE_MAIL) await refresh(showcaseId("mail", m.rel), "02_Gmail_Examples/" + m.rel);
  const stale = /https:\/\/raw\.githubusercontent\.com\/tgmstudios\/c0mpiled\/[0-9a-f]+\/demo-content\//g;
  for (const file of await store.list("files")) {
    const url = typeof file.url === "string" ? file.url.replace(stale, SHOWCASE_URL) : file.url;
    if (file.synthetic === true && url !== file.url) await store.put("files", { ...file, url });
  }
  for (const article of await store.list("articles"))
    if (pristine(article)) {
      const json = JSON.stringify(article);
      const next = json.replace(stale, SHOWCASE_URL).replaceAll("Centre Valley", "Center Valley");
      if (next !== json) await store.put("articles", JSON.parse(next));
    }
  await store.put("meta", { id: "samples-v3", version: 3 });
}
