import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function setEnv(ctx, envValues) {
  ctx.host.env.get.mockImplementation((name) =>
    Object.prototype.hasOwnProperty.call(envValues, name) ? envValues[name] : null
  )
}

function quotasPayload(overrides = {}) {
  return {
    data: {
      planName: "Pro",
      quotas: [
        {
          label: "Monthly",
          used: 40,
          remaining: 60,
          limit: 100,
          resetAt: "2026-04-01T00:00:00Z",
        },
      ],
      ...overrides,
    },
  }
}

describe("synthetic plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("throws when no API key is configured", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow(
      "Synthetic API key missing. Save it in Setup or set SYNTHETIC_API_KEY."
    )
  })

  it("prefers the stored provider secret over env", async () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "apiKey" ? "stored-key" : null))
    setEnv(ctx, { SYNTHETIC_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(quotasPayload()),
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    const request = ctx.host.http.request.mock.calls[0][0]
    expect(request.url).toBe("https://api.synthetic.new/v2/quotas")
    expect(request.headers.Authorization).toBe("Bearer stored-key")
  })

  it("falls back to SYNTHETIC_API_KEY when no stored secret exists", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { SYNTHETIC_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(quotasPayload()),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Pro")
    expect(result.lines.find((line) => line.label === "Tier")?.text).toBe("Pro")
  })

  it("renders the primary quota as credits progress", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { SYNTHETIC_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(quotasPayload()),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Credits")).toEqual({
      type: "progress",
      label: "Credits",
      used: 40,
      limit: 100,
      format: { kind: "percent" },
      resetsAt: "2026-04-01T00:00:00.000Z",
    })
  })

  it("derives usage from remaining when the API omits used", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { SYNTHETIC_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        plan: "Team",
        quotas: [
          {
            name: "Weekly",
            remaining: 75,
            limit: 100,
            periodHours: 168,
          },
        ],
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Team")
    expect(result.lines.find((line) => line.label === "Credits")).toEqual({
      type: "progress",
      label: "Credits",
      used: 25,
      limit: 100,
      format: { kind: "percent" },
      periodDurationMs: 604800000,
    })
  })

  it("accepts percent-based quota payloads", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { SYNTHETIC_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        data: {
          packageName: "Starter",
          quota: {
            type: "Daily",
            percentUsed: 0.25,
          },
        },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Starter")
    expect(result.lines.find((line) => line.label === "Credits")).toEqual({
      type: "progress",
      label: "Credits",
      used: 25,
      limit: 100,
      format: { kind: "percent" },
    })
  })

  it("throws a precise auth error for auth failures", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { SYNTHETIC_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(
      "Synthetic API key invalid. Check Setup or SYNTHETIC_API_KEY."
    )
  })

  it("throws for invalid JSON", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { SYNTHETIC_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "nope" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Synthetic response invalid. Try again later.")
  })

  it("throws when no quota entries can be parsed", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { SYNTHETIC_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ data: { planName: "Pro", quotas: [] } }),
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(
      "Synthetic quota response missing usage data. Try again later."
    )
  })

  it("throws for non-2xx responses", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { SYNTHETIC_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({ status: 500, bodyText: "{}" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Synthetic request failed (HTTP 500). Try again later.")
  })
})
