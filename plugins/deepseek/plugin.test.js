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

function balancePayload(infos, overrides = {}) {
  return {
    is_available: true,
    balance_infos: infos || [
      {
        currency: "USD",
        total_balance: "50.00",
        granted_balance: "10.00",
        topped_up_balance: "40.00",
      },
    ],
    ...overrides,
  }
}

describe("deepseek plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("throws when no API key is configured", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(
      "DeepSeek API key missing. Save it in Setup or set DEEPSEEK_API_KEY."
    )
  })

  it("prefers the stored provider secret over env", async () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "apiKey" ? "secret-key" : null))
    setEnv(ctx, { DEEPSEEK_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: JSON.stringify(balancePayload()) })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    const request = ctx.host.http.request.mock.calls[0][0]
    expect(request.url).toBe("https://api.deepseek.com/user/balance")
    expect(request.headers.Authorization).toBe("Bearer secret-key")
  })

  it("falls back through DEEPSEEK_API_KEY then DEEPSEEK_KEY", async () => {
    const ctx = makeCtx()
    setEnv(ctx, {
      DEEPSEEK_API_KEY: "",
      DEEPSEEK_KEY: "fallback-key",
    })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: JSON.stringify(balancePayload()) })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Balance: $50.00")
    expect(ctx.host.http.request.mock.calls[0][0].headers.Authorization).toBe("Bearer fallback-key")
  })

  it("prefers USD and renders total, paid, and granted balances", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { DEEPSEEK_API_KEY: "deepseek-key" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(balancePayload([
        {
          currency: "CNY",
          total_balance: "100.00",
          granted_balance: "0.00",
          topped_up_balance: "100.00",
        },
        {
          currency: "USD",
          total_balance: "20.00",
          granted_balance: "5.00",
          topped_up_balance: "15.00",
        },
      ])),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Balance")).toEqual({
      type: "progress",
      label: "Balance",
      used: 20,
      limit: 20,
      format: { kind: "dollars" },
    })
    expect(result.lines.find((line) => line.label === "Paid balance")).toEqual({
      type: "text",
      label: "Paid balance",
      value: "$15.00",
    })
    expect(result.lines.find((line) => line.label === "Granted balance")).toEqual({
      type: "text",
      label: "Granted balance",
      value: "$5.00",
    })
  })

  it("uses CNY symbol when only CNY balance is returned", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { DEEPSEEK_API_KEY: "deepseek-key" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(balancePayload([
        {
          currency: "CNY",
          total_balance: "110.00",
          granted_balance: "10.00",
          topped_up_balance: "100.00",
        },
      ])),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Balance: ¥110.00")
    expect(result.lines.find((line) => line.label === "Paid balance")?.value).toBe("¥100.00")
  })

  it("shows API availability detail when balance is unavailable for calls", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { DEEPSEEK_API_KEY: "deepseek-key" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(balancePayload(undefined, { is_available: false })),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "API availability")).toEqual({
      type: "text",
      label: "API availability",
      value: "Unavailable for API calls",
    })
  })

  it("throws a precise auth error on 401", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { DEEPSEEK_API_KEY: "deepseek-key" })
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("DeepSeek API key invalid. Check Setup or DEEPSEEK_API_KEY.")
  })

  it("throws on non-auth HTTP errors", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { DEEPSEEK_API_KEY: "deepseek-key" })
    ctx.host.http.request.mockReturnValue({ status: 500, bodyText: "" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("DeepSeek balance request failed (HTTP 500). Try again later.")
  })

  it("throws on invalid JSON", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { DEEPSEEK_API_KEY: "deepseek-key" })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "not-json" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("DeepSeek balance response invalid. Try again later.")
  })

  it("throws when a balance value is not numeric", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { DEEPSEEK_API_KEY: "deepseek-key" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(balancePayload([
        {
          currency: "USD",
          total_balance: "not-a-number",
          granted_balance: "0.00",
          topped_up_balance: "0.00",
        },
      ])),
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("DeepSeek balance response invalid. Try again later.")
  })
})
