export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export async function api(path: string, method = "GET", body?: any) {
  const r = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  // Only an expired OrgFlow session signs the user out; other 401s (such as
  // "connect Google first") are ordinary errors for the caller to show.
  if (
    r.status === 401 &&
    !path.startsWith("/auth/") &&
    (!d.error || /sign in/i.test(d.error))
  ) {
    window.dispatchEvent(new Event("orgflow:signed-out"));
  }
  if (!r.ok) throw new ApiError(d.error || "Request failed", r.status, d.code);
  return d;
}

export type Stamp = { id: string; name: string } | null;
export type Article = {
  id: string;
  title: string;
  categoryId: string;
  content: any;
  status: string;
  updatedAt: string;
  sources?: any[];
  ownerId?: string | null;
  publishedBy?: Stamp;
  publishedAt?: string;
  reviewDueAt?: string | null;
  reviewedAt?: string;
  reviewedBy?: Stamp;
};
export type Person = {
  id: string;
  name: string;
  role: string;
  email?: string;
  status: "active" | "leaving" | "left";
  leaveDate?: string;
  successorId?: string;
  handoffArticleId?: string;
  createdAt: string;
};
export type RunStep = {
  id: string;
  text: string;
  done: boolean;
  doneAt?: string;
  doneBy?: Stamp;
  note?: string;
};
export type Run = {
  id: string;
  articleId: string;
  title: string;
  assigneeId?: string;
  dueAt?: string;
  startedBy: Stamp;
  startedAt: string;
  status: "active" | "completed";
  completedAt?: string;
  steps: RunStep[];
};
export type Evidence = {
  id: string;
  title: string;
  provider: string;
  url?: string;
  from?: string;
  updatedAt?: string;
};
export type Candidate = {
  id: string;
  title: string;
  summary: string;
  frequency?: string;
  evidence: Evidence[];
  status: "suggested" | "drafted" | "dismissed";
  articleId?: string;
  createdAt: string;
};
export type IndexedSource = {
  id: string;
  title: string;
  provider: string;
  url?: string;
  from?: string;
  updatedAt: string;
  indexedAt: string;
  chunkCount: number;
  preview: string;
};
export type OrgInfo = {
  id: string;
  name: string;
  role: "admin" | "member";
  inviteCode?: string;
  members: { id: string; name: string; email: string; role: string }[];
};
export type AuditEntry = {
  id: string;
  at: string;
  actor: { id: string; name: string } | null;
  action: string;
  target?: any;
};

export const fullDate = (d?: string) => {
  if (!d) return "";
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Date(d + "T12:00:00")
    : new Date(d);
  return isNaN(parsed.getTime())
    ? d
    : parsed.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
};
export const dateTime = (d: string) =>
  new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
export const isOverdue = (iso?: string | null) =>
  !!iso && new Date(iso).getTime() < Date.now();
export const toDateInput = (iso?: string | null) => {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const fromDateInput = (value: string) =>
  value ? new Date(value + "T12:00:00").toISOString() : null;

export const GOOGLE_INDEX_CONSENT =
  "Index the text of recent Google Docs and emails into OrgFlow. Indexed text stays in OrgFlow, is used to answer questions and suggest playbooks, and may be sent to OrgFlow's AI provider (Luminal) for those answers and drafts. You can remove it any time.";

const LIST_NODES = new Set(["bulletList", "orderedList", "taskList"]);
export function hasListSteps(node: any): boolean {
  if (!node || typeof node !== "object") return false;
  if (LIST_NODES.has(node.type)) return true;
  return Array.isArray(node.content) && node.content.some(hasListSteps);
}

export const actionLabels: Record<string, string> = {
  "article.publish": "Published an article",
  "article.review": "Marked an article as reviewed",
  "run.start": "Started a checklist",
  "run.complete": "Completed a checklist",
  "run.delete": "Deleted a checklist",
  "person.update": "Updated a person",
  "transfer.handoff": "Generated a handoff guide",
  "discover.run": "Searched for recurring work",
  "discover.draft": "Drafted a playbook from a suggestion",
  "index.remove": "Removed an indexed source",
  "index.clear": "Cleared all indexed sources",
  "org.invite.rotate": "Created a new invite code",
};
