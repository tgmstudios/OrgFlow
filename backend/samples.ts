import type { Store } from "./store";

/**
 * Sample content for the shared demo workspace (organization "default") so Ask, checklists, ownership,
 * review and Transfer can be shown end to end. Every item is `synthetic: true` and labelled as a sample
 * in the UI. Added once (meta "samples-v1"); staff edits are never overwritten. New organizations
 * created at sign-up start empty and never receive these.
 */
const text = (t: string) => ({ type: "text", text: t });
const p = (t: string) => ({ type: "paragraph", content: [text(t)] });
const h = (t: string) => ({ type: "heading", attrs: { level: 2 }, content: [text(t)] });
const steps = (items: string[]) => ({
  type: "orderedList",
  content: items.map((t) => ({ type: "listItem", content: [p(t)] })),
});
const doc = (...content: unknown[]) => ({ type: "doc", content });

const people = [
  { id: "person-maya", name: "Maya Chen", role: "Development Director", email: "maya@example.org", status: "leaving", leaveDate: "2026-11-15" },
  { id: "person-jordan", name: "Jordan Lee", role: "Volunteer Coordinator", email: "jordan@example.org", status: "active" },
  { id: "person-sam", name: "Sam Rivera", role: "Operations Manager", email: "sam@example.org", status: "active" },
  { id: "person-priya", name: "Priya Patel", role: "Development Associate", email: "priya@example.org", status: "active" },
];

const articles = [
  {
    id: "article-welcome",
    title: "Donor thank-you process",
    categoryId: "cat-stewardship",
    ownerId: "person-maya",
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
    ownerId: "person-maya",
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
    ownerId: "person-jordan",
    content: doc(
      p("Sample: building next month's volunteer schedule."),
      h("Steps"),
      steps([
        "By the 15th, send the availability form to active volunteers.",
        "On the 22nd, build the schedule from responses; fill gaps from the waitlist.",
        "Send confirmations with shift details and parking information.",
        "Two days before each shift, send a reminder text.",
      ]),
    ),
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

export async function seedSamples(store: Store) {
  if (await store.get("meta", "samples-v1")) return;
  const now = new Date().toISOString();
  const reviewDue = new Date(Date.now() + 60 * 86400000).toISOString();
  for (const person of people)
    if (!(await store.get("people", person.id)))
      await store.put("people", { ...person, synthetic: true, createdAt: now });
  for (const article of articles) {
    const current = await store.get("articles", article.id);
    // Only replace the original one-paragraph seed article, never staff-edited content.
    const untouched =
      current?.synthetic === true && JSON.stringify(current.content).length < 400;
    if (current && !untouched) continue;
    await store.put("articles", {
      ...article,
      synthetic: true,
      status: "published",
      publishedTitle: article.title,
      publishedContent: article.content,
      publishedCategoryId: article.categoryId,
      publishedBy: { id: "sample", name: "Sample data" },
      publishedAt: now,
      reviewDueAt: article.id === "article-grant-report" ? new Date(Date.now() - 3 * 86400000).toISOString() : reviewDue,
      updatedAt: now,
    });
  }
  await store.put("meta", { id: "samples-v1", version: 1 });
}
