import { beforeEach, describe, expect, it, vi } from "vitest"
import { makePluginTestContext } from "../test-helpers.js"
async function loadPlugin() {
  vi.resetModules()
  delete globalThis.__openusage_plugin
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}
describe("devin plugin", () => {
  beforeEach(() => vi.restoreAllMocks())
  it("renders authoritative zero and weekly usage", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("Bearer token")
    ctx.host.providerConfig = { get: vi.fn(() => "org_test") }
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        daily_percentage: 0,
        weekly_percentage: 42,
        daily_reset_at: "2026-02-03T00:00:00Z",
        weekly_reset_at: "2026-02-09T00:00:00Z",
      }),
    })
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Daily")).toMatchObject({
      used: 0,
      limit: 100,
      resetsAt: "2026-02-03T00:00:00.000Z",
    })
    expect(result.lines.find((line) => line.label === "Weekly")).toMatchObject({
      used: 42,
      limit: 100,
    })
  })
  it("requires an explicit internal organization", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("token")
    ctx.host.providerConfig = { get: vi.fn(() => "my-team") }
    expect(() => plugin.probe(ctx)).toThrow("organization ID missing")
  })
  it("reports auth failure", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("token")
    ctx.host.providerConfig = { get: vi.fn(() => "org_test") }
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "" })
    expect(() => plugin.probe(ctx)).toThrow("session invalid")
  })

  it("rejects an empty quota response", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("token")
    ctx.host.providerConfig = { get: vi.fn(() => "org_test") }
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "{}" })
    expect(() => plugin.probe(ctx)).toThrow("missing quota data")
  })
})
