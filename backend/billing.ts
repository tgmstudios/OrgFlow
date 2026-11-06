/** Billable action names; also used as the Stripe meter `event_name` when metering is on. */
export const EVENT_ASK = "ask_assistant";
export const EVENT_DRAFT = "draft_sop";
export const EVENT_GOOGLE_IMPORT = "google_import";

/**
 * Stripe is called over its REST API with `fetch`, so there is no SDK dependency.
 *
 * - STRIPE_SECRET_KEY     server-only secret key; billing is inert without it
 * - STRIPE_PRICE_ID       recurring price a user subscribes to via Checkout
 * - BILLING_ENFORCE       set to "false" to skip entitlement checks
 * - STRIPE_METER_EVENTS   set to "true" to report usage to Stripe meters named after the events above
 *
 * A user maps to a Stripe customer through `metadata[orgflow_user_id]`.
 */
export type Stripe = (
  method: "GET" | "POST",
  path: string,
  params?: Record<string, string>,
  idempotencyKey?: string,
) => Promise<any>;

const stripeClient: Stripe = async (method, path, params = {}, idempotencyKey) => {
  const body = new URLSearchParams(params);
  const url = `https://api.stripe.com/v1${path}${method === "GET" && body.size ? `?${body}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(method === "POST" && { "content-type": "application/x-www-form-urlencoded" }),
      ...(idempotencyKey && { "idempotency-key": idempotencyKey }),
    },
    body: method === "POST" ? body : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe returned ${res.status}`);
  return json;
};

export const billingConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

const enforcing = () => process.env.BILLING_ENFORCE !== "false";

const USER_KEY = "orgflow_user_id";

/** Find the user's Stripe customer. With `create`, make one when none exists. */
async function customerId(
  stripe: Stripe,
  userId: string,
  create: boolean,
  email?: string,
): Promise<string | null> {
  const found = await stripe("GET", "/customers/search", {
    query: `metadata['${USER_KEY}']:'${userId.replace(/['\\]/g, "")}'`,
    limit: "1",
  });
  if (found.data?.[0]?.id) return found.data[0].id;
  if (!create) return null;
  const made = await stripe(
    "POST",
    "/customers",
    { [`metadata[${USER_KEY}]`]: userId, ...(email && { email }) },
    `orgflow-customer-${userId}`,
  );
  return made.id;
}

/**
 * Entitlement gate for a billable action. Returns a 403 Response when the user has no active
 * subscription, or null to proceed. Fails open on Stripe errors so a billing outage does not
 * take the app down.
 */
export async function entitlementGate(
  userId: string,
  _eventType: string,
  stripe: Stripe = stripeClient,
): Promise<Response | null> {
  if (!enforcing() || !billingConfigured()) return null;
  try {
    const customer = await customerId(stripe, userId, false);
    const subs = customer
      ? await stripe("GET", "/subscriptions", { customer, status: "all", limit: "10" })
      : { data: [] };
    const active = (subs.data as { status: string }[]).some((s) =>
      ["active", "trialing"].includes(s.status),
    );
    if (!active)
      return Response.json(
        {
          error: "NO_SUBSCRIPTION",
          decision: "DENY",
          message: "Your plan does not include this action. Choose a plan to continue.",
        },
        { status: 403 },
      );
  } catch (error) {
    console.error("entitlement check failed, allowing request", error);
  }
  return null;
}

/** Record one billable event on a Stripe meter. Metering must never break the user's request. */
export async function meter(
  userId: string,
  eventType: string,
  stripe: Stripe = stripeClient,
) {
  if (!billingConfigured() || process.env.STRIPE_METER_EVENTS !== "true") return;
  try {
    const customer = await customerId(stripe, userId, false);
    if (!customer) return;
    await stripe("POST", "/billing/meter_events", {
      event_name: eventType,
      "payload[stripe_customer_id]": customer,
      "payload[value]": "1",
    });
  } catch (error) {
    console.error("metering failed", { eventType, error });
  }
}

/** Where hosted pages send the browser back to: the app's own front end. */
export function appReturnUrl() {
  const origin = process.env.FRONTEND_ORIGIN ?? "http://localhost:3002";
  return `${origin.replace(/\/$/, "")}${process.env.APP_BASE_PATH ?? ""}/`;
}

export class BillingUnavailable extends Error {}

/**
 * Mint a Stripe-hosted page URL on demand: Checkout for a plan, or the customer portal to
 * manage an existing subscription.
 */
export async function hostedUrl(
  surface: "pricing" | "portal",
  userId: string,
  email?: string,
  stripe: Stripe = stripeClient,
): Promise<string> {
  if (!userId) throw new Error("userId is required");
  if (!billingConfigured())
    throw new BillingUnavailable("Billing is not configured on this server.");
  if (surface === "pricing" && !process.env.STRIPE_PRICE_ID)
    throw new BillingUnavailable("Billing is not configured on this server.");
  const returnUrl = appReturnUrl();
  try {
    const customer = (await customerId(stripe, userId, true, email))!;
    if (surface === "pricing")
      return (
        await stripe("POST", "/checkout/sessions", {
          mode: "subscription",
          customer,
          client_reference_id: userId,
          "line_items[0][price]": process.env.STRIPE_PRICE_ID!,
          "line_items[0][quantity]": "1",
          success_url: `${returnUrl}?checkout=success`,
          cancel_url: `${returnUrl}?checkout=expired`,
        })
      ).url;
    return (
      await stripe("POST", "/billing_portal/sessions", {
        customer,
        return_url: returnUrl,
      })
    ).url;
  } catch (error) {
    console.error("could not mint hosted billing session", { surface, error });
    throw new BillingUnavailable("Billing could not be opened right now. Please try again.");
  }
}
