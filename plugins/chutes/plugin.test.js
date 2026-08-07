import { beforeEach, describe, expect, it, vi } from "vitest"
import { makePluginTestContext } from "../test-helpers.js"
async function loadPlugin() {
  vi.resetModules()
  delete globalThis.__openusage_plugin
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

describe("chutes plugin", () => {
  beforeEach(() => vi.restoreAllMocks())
  it("reports missing credentials", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    expect(() => plugin.probe(ctx)).toThrow("API key missing")
  })

  it("renders subscription windows", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("cpk_test")
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        plan_name: "Pro",
        rolling_window: {
          used: 40,
          limit: 100,
          reset_at: "2026-02-02T04:00:00Z",
          unit: "requests",
        },
        monthly: { used: 250, limit: 1000, resets_at: "2026-03-01T00:00:00Z" },
      }),
    })
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "4-hour")).toMatchObject({
      used: 40,
      limit: 100,
      resetsAt: "2026-02-02T04:00:00.000Z",
    })
    expect(result.lines.find((line) => line.label === "Monthly")).toMatchObject({
      used: 250,
      limit: 1000,
    })
  })
  it("fills a partial response from quotas", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("cpk_test")
    ctx.host.http.request.mockImplementation(({ url }) => ({
      status: 200,
      bodyText: url.endsWith("subscription_usage")
        ? JSON.stringify({ monthly: { used: 5, limit: 10 } })
        : JSON.stringify({ rolling_window: { used: 2, limit: 8 } }),
    }))
    expect(plugin.probe(ctx).lines.find((line) => line.label === "4-hour")).toMatchObject({
      used: 2,
      limit: 8,
    })
  })
  it("reports auth failure", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("bad")
    ctx.host.http.request.mockReturnValue({ status: 403, bodyText: "" })
    expect(() => plugin.probe(ctx)).toThrow("API key invalid")
  })

  it("rejects an empty quota response", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("cpk_test")
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "{}" })
    expect(() => plugin.probe(ctx)).toThrow("missing quota data")
  })

  it("uses the environment key and derives partial quota values", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.env.get.mockImplementation((name) => (name === "CHUTES_API_KEY" ? "env-key" : null))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        data: {
          tier: "Scale",
          rolling_window: { remaining: 30, total: 100, unit: "requests" },
          quotas: [{ label: "monthly usage", percent_used: 0.4 }],
        },
      }),
    })

    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "4-hour")).toMatchObject({ used: 70 })
    expect(result.lines.find((line) => line.label === "Monthly")).toMatchObject({
      used: 40,
      limit: 100,
      format: { kind: "percent" },
    })
    expect(result.lines.find((line) => line.label === "Auth source")).toMatchObject({
      value: "CHUTES_API_KEY",
    })
  })

  it("maps network, HTTP, and invalid response failures", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("key")

    ctx.host.http.request.mockImplementation(() => {
      throw new Error("offline")
    })
    expect(() => plugin.probe(ctx)).toThrow("Check your connection")

    ctx.host.http.request.mockReturnValue({ status: 503, bodyText: "" })
    expect(() => plugin.probe(ctx)).toThrow("HTTP 503")

    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "not-json" })
    expect(() => plugin.probe(ctx)).toThrow("response invalid")
  })
})
