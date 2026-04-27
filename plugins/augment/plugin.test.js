import { beforeEach, describe, expect, it, vi } from "vitest"
import { makePluginTestContext } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function setCookie(ctx, value) {
  ctx.host.providerSecrets.read.mockImplementation((key) => (key === "cookieHeader" ? value : null))
}

function creditsPayload(overrides = {}) {
  return {
    usageUnitsRemaining: 20,
    usageUnitsConsumedThisBillingCycle: 80,
    usageUnitsAvailable: 100,
    usageBalanceStatus: "active",
    ...overrides,
  }
}

function subscriptionPayload(overrides = {}) {
  return {
    planName: "max plan",
    billingPeriodEnd: "2026-05-01T00:00:00.000Z",
    email: "user@example.com",
    organization: "Example Org",
    ...overrides,
  }
}

describe("augment plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("throws when no cookie header is configured", async () => {
    const ctx = makePluginTestContext()
    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow(
      "Augment Cookie header missing. Save it in Setup or set AUGMENT_COOKIE_HEADER."
    )
  })

  it("fetches credits with the stored cookie header", async () => {
    const ctx = makePluginTestContext()
    setCookie(ctx, "session=abc")
    ctx.host.http.request.mockImplementation((request) => {
      if (request.url.endsWith("/api/credits")) {
        return { status: 200, bodyText: JSON.stringify(creditsPayload()) }
      }
      if (request.url.endsWith("/api/subscription")) {
        return { status: 200, bodyText: JSON.stringify(subscriptionPayload()) }
      }
      return { status: 404, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Max Plan")
    expect(result.lines.find((line) => line.label === "Credits")).toEqual({
      type: "progress",
      label: "Credits",
      used: 80,
      limit: 100,
      format: { kind: "count", suffix: "credits" },
      resetsAt: "2026-05-01T00:00:00.000Z",
      periodDurationMs: 30 * 24 * 60 * 60 * 1000,
    })
    expect(result.lines.find((line) => line.label === "Remaining")?.value).toBe("20")
    expect(result.lines.find((line) => line.label === "Account")?.value).toBe("user@example.com")
    expect(ctx.host.http.request.mock.calls[0][0].headers.Cookie).toBe("session=abc")
  })

  it("falls back to AUGMENT_COOKIE_HEADER when no stored secret exists", async () => {
    const ctx = makePluginTestContext()
    ctx.host.env.get.mockImplementation((name) => (name === "AUGMENT_COOKIE_HEADER" ? "env=session" : null))
    ctx.host.http.request.mockImplementation((request) => {
      if (request.url.endsWith("/api/credits")) {
        return { status: 200, bodyText: JSON.stringify(creditsPayload({ usageUnitsRemaining: 5, usageUnitsConsumedThisBillingCycle: 15 })) }
      }
      return { status: 500, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Credits")?.used).toBe(15)
    expect(ctx.host.http.request.mock.calls[0][0].headers.Cookie).toBe("env=session")
  })

  it("throws a clear auth error for stale cookies", async () => {
    const ctx = makePluginTestContext()
    setCookie(ctx, "session=stale")
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(
      "Augment session expired. Re-capture the Cookie header from app.augmentcode.com."
    )
  })

  it("throws when credits fields are missing", async () => {
    const ctx = makePluginTestContext()
    setCookie(ctx, "session=abc")
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: JSON.stringify({}) })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(
      "Augment credits response missing usage fields. Refresh the Cookie header or update UsageBar."
    )
  })
})
