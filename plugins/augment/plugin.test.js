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
      "Augment auth missing. Run `auggie login` to confirm local auth, or save a dashboard Cookie header for credit usage."
    )
  })

  it("reports local Auggie auth when no dashboard cookie is configured", async () => {
    const ctx = makePluginTestContext()
    ctx.host.fs.writeText(
      "~/.augment/session.json",
      JSON.stringify({
        accessToken: "token",
        tenantURL: "https://tenant.api.augmentcode.com",
      })
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Auggie Session")
    expect(result.lines).toEqual([
      {
        type: "text",
        label: "Credits",
        value: "Dashboard cookie required",
      },
      {
        type: "text",
        label: "Auggie Auth",
        value: "Detected via ~/.augment/session.json",
      },
      {
        type: "text",
        label: "Source",
        value: "Local Auggie auth only; dashboard cookie required for credits",
      },
    ])
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("prefers AUGMENT_SESSION_AUTH over the Auggie session file for auth detection", async () => {
    const ctx = makePluginTestContext()
    ctx.host.env.get.mockImplementation((name) =>
      name === "AUGMENT_SESSION_AUTH"
        ? JSON.stringify({
            accessToken: "env-token",
            tenantURL: "https://tenant.api.augmentcode.com",
          })
        : null
    )
    ctx.host.fs.writeText(
      "~/.augment/session.json",
      JSON.stringify({
        accessToken: "file-token",
        tenantURL: "https://tenant.api.augmentcode.com",
      })
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Auggie Auth")?.value).toBe(
      "Detected via AUGMENT_SESSION_AUTH"
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
    expect(result.lines.find((line) => line.label === "Source")?.value).toBe("Dashboard session cookie")
    expect(result.lines.find((line) => line.label === "Auth source")?.value).toBe("Stored Cookie header")
    expect(result.lines.find((line) => line.label === "Endpoint")?.value).toBe(
      "https://app.augmentcode.com/api/credits"
    )
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
    expect(result.lines.find((line) => line.label === "Auth source")?.value).toBe("AUGMENT_COOKIE_HEADER")
    expect(result.lines.find((line) => line.label === "Endpoint")?.value).toBe(
      "https://app.augmentcode.com/api/credits"
    )
    expect(ctx.host.http.request.mock.calls[0][0].headers.Cookie).toBe("env=session")
  })

  it("renders partial credits data as text instead of fake progress", async () => {
    const ctx = makePluginTestContext()
    setCookie(ctx, "session=abc")
    ctx.host.http.request.mockImplementation((request) => {
      if (request.url.endsWith("/api/credits")) {
        return {
          status: 200,
          bodyText: JSON.stringify(creditsPayload({
            usageUnitsRemaining: undefined,
            usageUnitsConsumedThisBillingCycle: 15,
            usageUnitsAvailable: undefined,
          })),
        }
      }
      return { status: 500, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Credits")).toEqual({
      type: "text",
      label: "Credits",
      value: "15 used",
    })
    expect(result.lines.find((line) => line.label === "Remaining")?.value).toBe("Unknown")
  })

  it("keeps provider limits when usage exceeds available credits", async () => {
    const ctx = makePluginTestContext()
    setCookie(ctx, "session=abc")
    ctx.host.http.request.mockImplementation((request) => {
      if (request.url.endsWith("/api/credits")) {
        return {
          status: 200,
          bodyText: JSON.stringify(creditsPayload({
            usageUnitsRemaining: undefined,
            usageUnitsConsumedThisBillingCycle: 120,
            usageUnitsAvailable: 100,
          })),
        }
      }
      return { status: 500, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Credits")).toMatchObject({
      type: "progress",
      used: 120,
      limit: 100,
    })
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
