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

function makePayload(overrides = {}) {
  return [
    {
      result: {
        data: {
          json: {
            creditBlocks: [
              { amount_mUsd: 50000000, balance_mUsd: 20000000 },
            ],
          },
        },
      },
    },
    {
      result: {
        data: {
          json: {
            subscription: {
              tier: "Pro",
              currentPeriodUsageUsd: 30,
              currentPeriodBaseCreditsUsd: 100,
              currentPeriodBonusCreditsUsd: 20,
              nextBillingAt: "2026-04-01T00:00:00Z",
            },
          },
        },
      },
    },
    {
      result: {
        data: {
          json: {
            enabled: true,
          },
        },
      },
    },
    ...overrides.extraEntries || [],
  ]
}

describe("kilo plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("throws when no API key is configured", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow(
      "Kilo API key missing. Save it in Setup or set KILO_API_KEY."
    )
  })

  it("prefers the stored provider secret over env", async () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "apiKey" ? "stored-key" : null))
    setEnv(ctx, { KILO_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(makePayload()),
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    const request = ctx.host.http.request.mock.calls[0][0]
    expect(request.headers.Authorization).toBe("Bearer stored-key")
    expect(request.url).toContain("user.getCreditBlocks,kiloPass.getState,user.getAutoTopUpPaymentMethod")
    expect(request.url).toContain("batch=1")
  })

  it("falls back to KILO_API_KEY and renders pass usage as dollars progress", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { KILO_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(makePayload()),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Pro")
    expect(result.lines.find((line) => line.label === "Credits")).toEqual({
      type: "progress",
      label: "Credits",
      used: 30,
      limit: 120,
      format: { kind: "dollars" },
      resetsAt: "2026-04-01T00:00:00.000Z",
    })
    expect(result.lines.find((line) => line.label === "Plan")).toEqual({
      type: "badge",
      label: "Plan",
      text: "Pro",
    })
  })

  it("falls back to credit blocks when pass usage is missing", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { KILO_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify([
        makePayload()[0],
        { result: { data: { json: { subscription: { tier: "Starter" } } } } },
      ]),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Starter")
    expect(result.lines.find((line) => line.label === "Credits")).toEqual({
      type: "progress",
      label: "Credits",
      used: 30,
      limit: 50,
      format: { kind: "dollars" },
    })
  })

  it("maps auth failures from HTTP status", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { KILO_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Kilo API key invalid. Refresh KILO_API_KEY.")
  })

  it("maps auth failures from tRPC error payloads", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { KILO_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify([
        { error: { json: { data: { code: "UNAUTHORIZED" }, message: "unauthorized" } } },
      ]),
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Kilo API key invalid. Refresh KILO_API_KEY.")
  })

  it("maps missing endpoint failures", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { KILO_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({ status: 404, bodyText: "" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Kilo API endpoint not found. Verify the tRPC batch path.")
  })

  it("throws for invalid JSON", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { KILO_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "not-json" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Kilo response invalid. Try again later.")
  })

  it("throws when no usable usage data exists", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { KILO_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify([
        { result: { data: { json: {} } } },
        { result: { data: { json: {} } } },
      ]),
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Kilo response missing usage data. Try again later.")
  })
})
