import { describe, expect, it, vi } from "vitest"
import { makePluginTestContext } from "../test-helpers.js"
import "./plugin.js"

const probe = globalThis.__openusage_plugin.probe

function makeCtx(overrides = {}) {
  return makePluginTestContext(overrides)
}

describe("abacus plugin", () => {
  it("throws when no cookie is configured", () => {
    const ctx = makeCtx()

    expect(() => probe(ctx)).toThrow(/ABACUS_COOKIE_HEADER/)
  })

  it("fetches compute points and billing info with stored cookie", () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read = vi.fn(() => "sessionid=abc")
    ctx.host.http.request = vi.fn((request) => {
      if (request.url.includes("_getOrganizationComputePoints")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            success: true,
            result: {
              totalComputePoints: 1000,
              computePointsLeft: 750,
            },
          }),
        }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({
          success: true,
          result: {
            currentTier: "Pro",
            nextBillingDate: "2026-05-01T00:00:00Z",
          },
        }),
      }
    })

    const result = probe(ctx)

    expect(result.plan).toBe("Pro")
    expect(result.lines[0]).toMatchObject({
      type: "progress",
      label: "Credits",
      used: 250,
      limit: 1000,
      format: { kind: "count", suffix: "credits" },
      resetsAt: "2026-05-01T00:00:00.000Z",
    })
    expect(result.lines[1]).toMatchObject({
      type: "text",
      label: "Billing",
      value: "250 / 1,000 credits",
    })
    expect(ctx.host.http.request).toHaveBeenCalledTimes(2)
  })

  it("uses env cookie before stored cookie", () => {
    const ctx = makeCtx()
    ctx.host.env.get = vi.fn((name) => (name === "ABACUS_COOKIE_HEADER" ? "env_session=abc" : null))
    ctx.host.providerSecrets.read = vi.fn(() => "stored_session=def")
    ctx.host.http.request = vi.fn((request) => {
      expect(request.headers.Cookie).toBe("env_session=abc")
      return {
        status: 200,
        bodyText: JSON.stringify({
          success: true,
          result: request.url.includes("_getOrganizationComputePoints")
            ? { totalComputePoints: 10, computePointsLeft: 0 }
            : {},
        }),
      }
    })

    const result = probe(ctx)

    expect(result.lines[0]).toMatchObject({ used: 10, limit: 10 })
  })

  it("keeps credits when optional billing info fails", () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read = vi.fn(() => "sessionid=abc")
    ctx.host.http.request = vi.fn((request) => {
      if (request.url.includes("_getOrganizationComputePoints")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            success: true,
            result: { totalComputePoints: 100, computePointsLeft: 40 },
          }),
        }
      }
      return { status: 500, bodyText: "server error" }
    })

    const result = probe(ctx)

    expect(result.plan).toBeUndefined()
    expect(result.lines[0]).toMatchObject({ used: 60, limit: 100 })
    expect(ctx.host.log.warn).toHaveBeenCalled()
  })

  it("reports expired session on auth failure", () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read = vi.fn(() => "sessionid=abc")
    ctx.host.http.request = vi.fn(() => ({ status: 401, bodyText: "{}" }))

    expect(() => probe(ctx)).toThrow(/Session expired/)
  })

  it("reports missing credit fields", () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read = vi.fn(() => "sessionid=abc")
    ctx.host.http.request = vi.fn(() => ({
      status: 200,
      bodyText: JSON.stringify({ success: true, result: {} }),
    }))

    expect(() => probe(ctx)).toThrow(/missing credit fields/)
  })
})
