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

function balancePayload(overrides = {}) {
  return {
    code: 0,
    data: {
      available_balance: 49.58894,
      voucher_balance: 46.58893,
      cash_balance: 3.00001,
      ...overrides,
    },
    scode: "0x0",
    status: true,
  }
}

describe("kimi-k2 plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("throws when no API key is configured", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(
      "Moonshot API key missing. Save it in Setup or set MOONSHOT_API_KEY."
    )
  })

  it("prefers the stored provider secret over env", async () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "apiKey" ? "secret-key" : null))
    setEnv(ctx, { MOONSHOT_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: JSON.stringify(balancePayload()) })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    const request = ctx.host.http.request.mock.calls[0][0]
    expect(request.url).toBe("https://api.moonshot.ai/v1/users/me/balance")
    expect(request.headers.Authorization).toBe("Bearer secret-key")
  })

  it("falls back through MOONSHOT_API_KEY, KIMI_API_KEY, then KIMI_KEY", async () => {
    const ctx = makeCtx()
    setEnv(ctx, {
      MOONSHOT_API_KEY: "",
      KIMI_API_KEY: "",
      KIMI_KEY: "fallback-key",
    })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: JSON.stringify(balancePayload()) })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Available: $49.59")
    expect(ctx.host.http.request.mock.calls[0][0].headers.Authorization).toBe("Bearer fallback-key")
  })

  it("renders official Moonshot balance lines", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { MOONSHOT_API_KEY: "moonshot-key" })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: JSON.stringify(balancePayload()) })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Balance")).toEqual({
      type: "progress",
      label: "Balance",
      used: 49.58894,
      limit: 49.58894,
      format: { kind: "dollars" },
    })
    expect(result.lines.find((line) => line.label === "Voucher balance")).toEqual({
      type: "text",
      label: "Voucher balance",
      value: "$46.59",
    })
    expect(result.lines.find((line) => line.label === "Cash balance")).toEqual({
      type: "text",
      label: "Cash balance",
      value: "$3.00",
    })
  })

  it("throws a precise auth error on 401", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { MOONSHOT_API_KEY: "moonshot-key" })
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(
      "Moonshot API key invalid. Check Setup or MOONSHOT_API_KEY."
    )
  })

  it("throws on non-auth HTTP errors", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { MOONSHOT_API_KEY: "moonshot-key" })
    ctx.host.http.request.mockReturnValue({ status: 500, bodyText: "" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Moonshot API balance request failed (HTTP 500). Try again later.")
  })

  it("throws on invalid JSON", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { MOONSHOT_API_KEY: "moonshot-key" })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "not-json" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Moonshot API balance response invalid. Try again later.")
  })

  it("throws when the official balance shape is missing", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { MOONSHOT_API_KEY: "moonshot-key" })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: JSON.stringify({ data: {} }) })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Moonshot API balance response invalid. Try again later.")
  })
})
