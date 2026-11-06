import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  BillingUnavailable,
  entitlementGate,
  hostedUrl,
  meter,
} from "./billing";

/** Fake Stripe: one customer, with the given subscription statuses. */
const fake = (statuses: string[] = ["active"], hasCustomer = true) =>
  mock(async (method: string, path: string, _params?: Record<string, string>) => {
    if (path === "/customers/search")
      return { data: hasCustomer ? [{ id: "cus_1" }] : [] };
    if (path === "/customers") return { id: "cus_new" };
    if (path === "/subscriptions") return { data: statuses.map((status) => ({ status })) };
    if (path === "/checkout/sessions") return { url: "https://checkout.stripe.com/c/pay/x" };
    if (path === "/billing_portal/sessions") return { url: "https://billing.stripe.com/p/x" };
    if (path === "/billing/meter_events") return { id: "mev_1" };
    throw new Error(`unexpected ${method} ${path}`);
  });

describe("billing", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_PRICE_ID = "price_1";
    delete process.env.BILLING_ENFORCE;
    delete process.env.STRIPE_METER_EVENTS;
  });

  // Don't leak billing config into other test files, which would make real Stripe calls.
  afterEach(() => {
    for (const k of ["STRIPE_SECRET_KEY", "STRIPE_PRICE_ID", "BILLING_ENFORCE", "STRIPE_METER_EVENTS"])
      delete process.env[k];
  });

  it("allows an active or trialing subscriber", async () => {
    expect(await entitlementGate("u1", "ask_assistant", fake(["active"]) as any)).toBeNull();
    expect(await entitlementGate("u1", "ask_assistant", fake(["trialing"]) as any)).toBeNull();
  });

  it("returns 403 with no customer or no active subscription", async () => {
    const none = await entitlementGate("u1", "ask_assistant", fake([], false) as any);
    expect(none?.status).toBe(403);
    const canceled = await entitlementGate("u1", "ask_assistant", fake(["canceled"]) as any);
    expect(canceled?.status).toBe(403);
  });

  it("fails open when Stripe errors", async () => {
    const stripe = mock(async () => {
      throw new Error("down");
    });
    expect(await entitlementGate("u1", "ask_assistant", stripe as any)).toBeNull();
  });

  it("skips the gate when BILLING_ENFORCE=false or unconfigured", async () => {
    const stripe = fake([]);
    process.env.BILLING_ENFORCE = "false";
    expect(await entitlementGate("u1", "ask_assistant", stripe as any)).toBeNull();
    delete process.env.BILLING_ENFORCE;
    delete process.env.STRIPE_SECRET_KEY;
    expect(await entitlementGate("u1", "ask_assistant", stripe as any)).toBeNull();
    expect(stripe).not.toHaveBeenCalled();
  });

  it("reports meter events only when enabled, and swallows errors", async () => {
    const stripe = fake();
    await meter("u1", "draft_sop", stripe as any);
    expect(stripe).not.toHaveBeenCalled();
    process.env.STRIPE_METER_EVENTS = "true";
    await meter("u1", "draft_sop", stripe as any);
    const call = stripe.mock.calls.find((c) => c[1] === "/billing/meter_events")!;
    expect(call[2]).toMatchObject({
      event_name: "draft_sop",
      "payload[stripe_customer_id]": "cus_1",
    });
    const broken = mock(async () => {
      throw new Error("x");
    });
    await meter("u1", "draft_sop", broken as any);
  });

  it("mints a Checkout or portal URL, creating the customer when needed", async () => {
    const stripe = fake([], false);
    expect(await hostedUrl("pricing", "u1", "a@b.co", stripe as any)).toContain("checkout.stripe.com");
    expect(stripe.mock.calls.some((c) => c[1] === "/customers")).toBe(true);
    const session = stripe.mock.calls.find((c) => c[1] === "/checkout/sessions")![2]!;
    expect(session).toMatchObject({ mode: "subscription", customer: "cus_new" });
    expect(await hostedUrl("portal", "u1", undefined, fake() as any)).toContain("billing.stripe.com");
  });

  it("reports a clean error when minting fails or billing is unconfigured", async () => {
    const broken = mock(async () => {
      throw new Error("denied");
    });
    await expect(hostedUrl("pricing", "u1", undefined, broken as any)).rejects.toBeInstanceOf(
      BillingUnavailable,
    );
    delete process.env.STRIPE_SECRET_KEY;
    await expect(hostedUrl("portal", "u1", undefined, fake() as any)).rejects.toBeInstanceOf(
      BillingUnavailable,
    );
  });
});
