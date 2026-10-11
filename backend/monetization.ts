import { MonetizationAI } from "@aws-app-monetization/sdk";

/** Billable action names; must match each metric's sourceEventType in AWS Monetization. */
export const EVENT_ASK = "ask_assistant";
export const EVENT_DRAFT = "draft_sop";
export const EVENT_GOOGLE_IMPORT = "google_import";

const PRICING_COOKIE = "mai_pricing_url";
const PORTAL_COOKIE = "mai_billing_portal_url";
/** Hosted sessions are capped at 24h; the app session itself lasts 7 days, so users re-sign-in daily to refresh. */
const SESSION_SECONDS = 86400;

type Client = Pick<
  MonetizationAI,
  | "checkEntitlement"
  | "putEvent"
  | "createPricingSession"
  | "createBillingPortalSession"
>;

let loaded = false;
/**
 * Bun only auto-loads `.env`. Read `.env.monetization.local` (app identity, git-ignored) then
 * `.env.monetization` (endpoint/region, committed) once, without overriding real env vars.
 */
async function loadEnvFile() {
  if (loaded) return;
  loaded = true;
  if (process.env.NODE_ENV === "test") return; // keep the test suite offline
  for (const name of [".env.monetization.local", ".env.monetization"]) {
    const file = Bun.file(new URL(`../${name}`, import.meta.url));
    if (!(await file.exists())) continue;
    for (const line of (await file.text()).split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)=([^\s#]*)/);
      if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2];
    }
  }
}

let sdk: MonetizationAI | null = null;
/** Lazy: the constructor validates appId, so never construct at import time. */
export async function getMonetize(): Promise<Client> {
  await loadEnvFile();
  sdk ??= new MonetizationAI({ appId: process.env.MONETIZATION_APP_ID ?? "" });
  return sdk;
}

/** Billing is inert until an app id is configured, so the app still runs without it. */
export async function monetizationConfigured() {
  await loadEnvFile();
  return Boolean(process.env.MONETIZATION_APP_ID);
}

const enforcing = () => process.env.MONETIZATION_ENFORCE !== "false";

/**
 * Entitlement gate for a billable action. Returns a 403 Response when the user is denied, or
 * null to proceed. Fails open on service errors so a billing outage does not take the app down.
 */
export async function entitlementGate(
  userId: string,
  eventType: string,
  client?: Client,
): Promise<Response | null> {
  if (!enforcing() || !(await monetizationConfigured())) return null;
  try {
    const ent = await (client ?? (await getMonetize())).checkEntitlement(
      userId,
      { eventType },
    );
    if (ent.decision === "DENY")
      return Response.json(
        {
          error: ent.reason ?? "NOT_ENTITLED",
          decision: ent.decision,
          message: "Your plan does not include this action. Choose a plan to continue.",
        },
        { status: 403 },
      );
  } catch (error) {
    console.error("entitlement check failed, allowing request", error);
  }
  return null;
}

/** Record one billable event. Metering must never break the user's request. */
export async function meter(
  userId: string,
  eventType: string,
  client?: Client,
) {
  if (!(await monetizationConfigured())) return;
  try {
    await (client ?? (await getMonetize())).putEvent(userId, { eventType });
  } catch (error) {
    console.error("metering failed", { eventType, error });
  }
}

/** Where hosted pages send the browser back to: the app's own front end. */
export function appReturnUrl() {
  const origin = process.env.FRONTEND_ORIGIN ?? "http://localhost:3002";
  return `${origin.replace(/\/$/, "")}${process.env.APP_BASE_PATH ?? ""}/`;
}

const secureFlag = (req: Request) =>
  new URL(req.url).protocol === "https:" ||
  req.headers.get("x-forwarded-proto") === "https";

const cookie = (req: Request, name: string, value: string, maxAge: number) =>
  // Not HttpOnly on purpose: the sidebar launcher reads it client-side. First-party and Strict.
  `${name}=${encodeURIComponent(value)}; SameSite=Strict; Path=/; Max-Age=${maxAge}${secureFlag(req) ? "; Secure" : ""}`;

/**
 * Mint the hosted pricing and billing-portal sessions for a just-signed-in user and return the
 * two Set-Cookie values. Call once at sign-in. Never throws: a failure here must not block login.
 */
export async function sessionCookies(
  req: Request,
  userId: string,
  client?: Client,
): Promise<string[]> {
  if (!userId) throw new Error("userId is required");
  if (!(await monetizationConfigured())) return [];
  try {
    const sdkClient = client ?? (await getMonetize());
    const returnUrl = appReturnUrl();
    const [{ pricingUrl }, { billingPortalUrl }] = await Promise.all([
      sdkClient.createPricingSession(userId, {
        returnUrl: `${returnUrl}?checkout=success`,
        refreshUrl: `${returnUrl}?checkout=expired`,
        sessionDurationSeconds: SESSION_SECONDS,
      }),
      sdkClient.createBillingPortalSession(userId, {
        returnUrl,
        refreshUrl: `${returnUrl}?portal=expired`,
        sessionDurationSeconds: SESSION_SECONDS,
      }),
    ]);
    return [
      cookie(req, PRICING_COOKIE, pricingUrl, SESSION_SECONDS),
      cookie(req, PORTAL_COOKIE, billingPortalUrl, SESSION_SECONDS),
    ];
  } catch (error) {
    console.error("could not mint hosted billing sessions", error);
    return [];
  }
}

export class BillingUnavailable extends Error {}

/**
 * Mint one hosted page URL on demand. This is the fallback when the sign-in cookie is missing
 * (already-signed-in sessions, the 24h cookie expiring before the 7-day app session, a restart).
 */
export async function hostedUrl(
  surface: "pricing" | "portal",
  userId: string,
  client?: Client,
): Promise<string> {
  if (!userId) throw new Error("userId is required");
  if (!(await monetizationConfigured()))
    throw new BillingUnavailable("Billing is not configured on this server.");
  const sdkClient = client ?? (await getMonetize());
  const returnUrl = appReturnUrl();
  try {
    if (surface === "pricing")
      return (
        await sdkClient.createPricingSession(userId, {
          returnUrl: `${returnUrl}?checkout=success`,
          refreshUrl: `${returnUrl}?checkout=expired`,
          sessionDurationSeconds: 3600,
        })
      ).pricingUrl;
    return (
      await sdkClient.createBillingPortalSession(userId, {
        returnUrl,
        refreshUrl: `${returnUrl}?portal=expired`,
        sessionDurationSeconds: 3600,
      })
    ).billingPortalUrl;
  } catch (error) {
    console.error("could not mint hosted billing session", { surface, error });
    throw new BillingUnavailable("Billing could not be opened right now. Please try again.");
  }
}

export const clearSessionCookies = (req: Request) => [
  cookie(req, PRICING_COOKIE, "", 0),
  cookie(req, PORTAL_COOKIE, "", 0),
];
