import { afterEach, describe, expect, it, mock, beforeEach } from "bun:test";
import {
  clearSessionCookies,
  entitlementGate,
  meter,
  sessionCookies,
} from "./monetization";

const req = new Request("http://localhost:3003/api/auth/login", {
  method: "POST",
});

const fake = () => ({
  checkEntitlement: mock(async () => ({ decision: "ALLOW", reason: "OK" })),
  putEvent: mock(async () => ({})),
  createPricingSession: mock(async () => ({
    pricingUrl: "https://host.example/pricing#token=p",
  })),
  createBillingPortalSession: mock(async () => ({
    billingPortalUrl: "https://host.example/portal#token=b",
  })),
});

describe("monetization", () => {
  beforeEach(() => {
    process.env.MONETIZATION_APP_ID = "app-123";
    delete process.env.MONETIZATION_ENFORCE;
  });

  // Don't leak billing config into other test files, which would make real SDK calls.
  afterEach(() => {
    delete process.env.MONETIZATION_APP_ID;
    delete process.env.MONETIZATION_ENFORCE;
  });

  it("mints both hosted sessions and returns both cookies", async () => {
    const client = fake();
    const cookies = await sessionCookies(req, "user-1", client as any);
    expect(client.createPricingSession).toHaveBeenCalledTimes(1);
    expect(client.createBillingPortalSession).toHaveBeenCalledTimes(1);
    const call = (client.createPricingSession.mock.calls[0] as any[])[1];
    expect(call.returnUrl).toStartWith("http");
    expect(call.refreshUrl).toStartWith("http");
    expect(call.sessionDurationSeconds).toBeGreaterThan(0);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toStartWith("mai_pricing_url=");
    expect(cookies[1]).toStartWith("mai_billing_portal_url=");
    expect(cookies.every((c) => c.includes("SameSite=Strict"))).toBe(true);
    expect(cookies.some((c) => c.includes("HttpOnly"))).toBe(false);
  });

  it("throws and mints nothing for an empty userId", async () => {
    const client = fake();
    await expect(sessionCookies(req, "", client as any)).rejects.toThrow();
    expect(client.createPricingSession).not.toHaveBeenCalled();
  });

  it("never blocks sign-in when minting fails", async () => {
    const client = fake();
    client.createPricingSession.mockRejectedValueOnce(new Error("boom"));
    expect(await sessionCookies(req, "user-1", client as any)).toEqual([]);
  });

  it("returns 403 on DENY and null on ALLOW", async () => {
    const denied = fake();
    denied.checkEntitlement.mockResolvedValueOnce({
      decision: "DENY",
      reason: "NO_SUBSCRIPTION",
    });
    const res = await entitlementGate("user-1", "ask_assistant", denied as any);
    expect(res?.status).toBe(403);
    expect(
      await entitlementGate("user-1", "ask_assistant", fake() as any),
    ).toBeNull();
  });

  it("fails open when the entitlement service errors", async () => {
    const client = fake();
    client.checkEntitlement.mockRejectedValueOnce(new Error("down"));
    expect(
      await entitlementGate("user-1", "ask_assistant", client as any),
    ).toBeNull();
  });

  it("skips the gate when MONETIZATION_ENFORCE=false", async () => {
    process.env.MONETIZATION_ENFORCE = "false";
    const client = fake();
    expect(
      await entitlementGate("user-1", "ask_assistant", client as any),
    ).toBeNull();
    expect(client.checkEntitlement).not.toHaveBeenCalled();
  });

  it("meters with the metric's event type and swallows errors", async () => {
    const client = fake();
    await meter("user-1", "draft_sop", client as any);
    expect(client.putEvent).toHaveBeenCalledWith("user-1", {
      eventType: "draft_sop",
    });
    client.putEvent.mockRejectedValueOnce(new Error("x"));
    await meter("user-1", "draft_sop", client as any);
  });

  it("clears both cookies at sign-out", () => {
    const cleared = clearSessionCookies(req);
    expect(cleared).toHaveLength(2);
    expect(cleared.every((c) => c.includes("Max-Age=0"))).toBe(true);
  });
});
