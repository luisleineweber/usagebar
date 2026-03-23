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

function payload(overrides) {
  return {
    data: {
      total_credits_consumed: 40,
      credits_remaining: 60,
      average_tokens_per_request: 2048,
      ...overrides,
    },
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
      "Kimi K2 API key missing. Save it in Setup or set KIMI_K2_API_KEY."
    )
  })

  it("prefers the stored provider secret over env", async () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "apiKey" ? "secret-key" : null))
    setEnv(ctx, { KIMI_K2_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: JSON.stringify(payload()) })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    const request = ctx.host.http.request.mock.calls[0][0]
    expect(request.headers.Authorization).toBe("Bearer secret-key")
  })

  it("falls back through KIMI_K2_API_KEY, KIMI_API_KEY, then KIMI_KEY", async () => {
    const ctx = makeCtx()
    setEnv(ctx, {
      KIMI_K2_API_KEY: "",
      KIMI_API_KEY: "",
      KIMI_KEY: "fallback-key",
    })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: JSON.stringify(payload()) })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Remaining: 60")
    expect(ctx.host.http.request.mock.calls[0][0].headers.Authorization).toBe("Bearer fallback-key")
  })

  it("renders credits progress and average tokens", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { KIMI_K2_API_KEY: "kimi-key" })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: JSON.stringify(payload()) })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Credits")).toEqual({
      type: "progress",
      label: "Credits",
      used: 40,
      limit: 100,
      format: { kind: "count", suffix: "credits" },
    })
    expect(result.lines.find((line) => line.label === "Average tokens")).toEqual({
      type: "text",
      label: "Average tokens",
      value: "2048",
    })
  })

  it("parses alternate usage keys", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { KIMI_API_KEY: "kimi-key" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        result: {
          usage: {
            total: "12.5",
            remaining: "87.5",
          },
        },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Remaining: 87.50")
    expect(result.lines.find((line) => line.label === "Credits")?.used).toBe(12.5)
  })

  it("falls back to x-credits-remaining when JSON omits remaining credits", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { KIMI_K2_API_KEY: "kimi-key" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: {
        "x-credits-remaining": "33",
      },
      bodyText: JSON.stringify({
        data: {
          total_credits_consumed: 7,
        },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Remaining: 33")
    expect(result.lines.find((line) => line.label === "Credits")?.limit).toBe(40)
  })

  it("shows unavailable average tokens when the field is missing", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { KIMI_K2_API_KEY: "kimi-key" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        data: {
          total_credits_consumed: 10,
          credits_remaining: 90,
        },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Average tokens")?.value).toBe("Unavailable")
  })

  it("throws a precise auth error on 401", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { KIMI_K2_API_KEY: "kimi-key" })
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(
      "Kimi K2 API key invalid. Check Setup or KIMI_K2_API_KEY."
    )
  })

  it("throws on non-auth HTTP errors", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { KIMI_K2_API_KEY: "kimi-key" })
    ctx.host.http.request.mockReturnValue({ status: 500, bodyText: "" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Kimi K2 request failed (HTTP 500). Try again later.")
  })

  it("throws on invalid JSON", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { KIMI_K2_API_KEY: "kimi-key" })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "not-json" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Kimi K2 response invalid. Try again later.")
  })
})
