import { beforeEach, describe, expect, it, vi } from "vitest"
import { makePluginTestContext } from "../test-helpers.js"
async function loadPlugin() {
  vi.resetModules()
  delete globalThis.__openusage_plugin
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}
describe("stepfun plugin", () => {
  beforeEach(() => vi.restoreAllMocks())
  it("reports missing credentials", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    expect(() => plugin.probe(ctx)).toThrow("Oasis-Token missing")
  })

  it("renders five-hour and weekly remaining rates", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("oasis-token")
    ctx.host.http.request.mockImplementation(({ url }) => ({
      status: 200,
      bodyText: url.endsWith("GetStepPlanStatus")
        ? JSON.stringify({ status: 1, subscription: { name: "Plus" } })
        : JSON.stringify({
            status: 1,
            five_hour_usage_left_rate: 0.8,
            weekly_usage_left_rate: 0.6,
            five_hour_usage_reset_time: "1777528800",
            weekly_usage_reset_time: 1777899600,
          }),
    }))
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "5-hour")).toMatchObject({
      used: 20,
      limit: 100,
      resetsAt: "2026-04-30T06:00:00.000Z",
    })
    expect(result.lines.find((line) => line.label === "Weekly")).toMatchObject({
      used: 40,
      limit: 100,
    })
    expect(result.lines.find((line) => line.label === "Plan")).toMatchObject({ text: "Plus" })
  })
  it("keeps usage when plan status fails", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("oasis-token")
    ctx.host.http.request.mockImplementation(({ url }) =>
      url.endsWith("GetStepPlanStatus")
        ? { status: 500, bodyText: "" }
        : {
            status: 200,
            bodyText: JSON.stringify({
              status: 1,
              five_hour_usage_left_rate: 1,
              weekly_usage_left_rate: 1,
              five_hour_usage_reset_time: 1777528800,
              weekly_usage_reset_time: 1777899600,
            }),
          }
    )
    expect(plugin.probe(ctx).lines.filter((line) => line.type === "progress")).toHaveLength(2)
  })
  it("reports auth failure", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("expired")
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "" })
    expect(() => plugin.probe(ctx)).toThrow("token invalid")
  })

  it("rejects an empty quota response", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("oasis-token")
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "{}" })
    expect(() => plugin.probe(ctx)).toThrow("missing quota data")
  })

  it("does not treat null quota rates as authoritative zero", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("oasis-token")
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        status: 1,
        five_hour_usage_left_rate: null,
        weekly_usage_left_rate: null,
      }),
    })
    expect(() => plugin.probe(ctx)).toThrow("missing quota data")
  })

  it("uses the environment token and accepts boolean success", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.env.get.mockImplementation((name) => (name === "STEPFUN_TOKEN" ? "env-token" : null))
    ctx.host.http.request.mockImplementation(({ url }) => ({
      status: 200,
      bodyText: url.endsWith("GetStepPlanStatus")
        ? "{}"
        : JSON.stringify({
            status: true,
            five_hour_usage_left_rate: 1.2,
            weekly_usage_left_rate: -0.2,
          }),
    }))

    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "5-hour")).toMatchObject({ used: 0 })
    expect(result.lines.find((line) => line.label === "Weekly")).toMatchObject({ used: 100 })
    expect(result.lines.find((line) => line.label === "Auth source")).toMatchObject({
      value: "STEPFUN_TOKEN",
    })
  })

  it("maps network, HTTP, invalid JSON, and provider failures", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("token")

    ctx.host.http.request.mockImplementation(() => {
      throw new Error("offline")
    })
    expect(() => plugin.probe(ctx)).toThrow("Check your connection")

    ctx.host.http.request.mockReturnValue({ status: 503, bodyText: "" })
    expect(() => plugin.probe(ctx)).toThrow("HTTP 503")

    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "not-json" })
    expect(() => plugin.probe(ctx)).toThrow("response invalid")

    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: JSON.stringify({ status: 0 }) })
    expect(() => plugin.probe(ctx)).toThrow("quota request failed")
  })
})
