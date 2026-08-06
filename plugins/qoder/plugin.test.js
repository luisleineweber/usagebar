import { beforeEach, describe, expect, it, vi } from "vitest"
import { makePluginTestContext } from "../test-helpers.js"
async function loadPlugin() {
  vi.resetModules()
  delete globalThis.__openusage_plugin
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}
describe("qoder plugin", () => {
  beforeEach(() => vi.restoreAllMocks())
  it("merges total and shared credits", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("Cookie: session=test")
    ctx.host.providerConfig = { get: vi.fn(() => "qoder.com.cn") }
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        nextResetAt: "2026-03-01T00:00:00Z",
        totalQuota: { quotaSummary: { usedValue: 1500, limitValue: 1500, remainingValue: 0 } },
        sharedQuota: { quotaSummary: { usedValue: 200, limitValue: 1000, remainingValue: 800 } },
      }),
    })
    const result = plugin.probe(ctx)
    expect(result.lines[0]).toMatchObject({
      used: 1700,
      limit: 2500,
      resetsAt: "2026-03-01T00:00:00.000Z",
    })
    expect(ctx.host.http.request.mock.calls[0][0].url).toContain("qoder.com.cn")
    expect(ctx.host.http.request.mock.calls[0][0].headers.Cookie).toBe("session=test")
  })
  it("keeps authoritative zero", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("session=test")
    ctx.host.providerConfig = { get: vi.fn(() => "qoder.com") }
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        totalQuota: { quotaSummary: { usedValue: 0, limitValue: 0, remainingValue: 0 } },
      }),
    })
    expect(plugin.probe(ctx).lines[0]).toMatchObject({ type: "badge", text: "No credits" })
  })
  it("reports auth failure", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("session=test")
    ctx.host.providerConfig = { get: vi.fn(() => "") }
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "" })
    expect(() => plugin.probe(ctx)).toThrow("session invalid")
  })

  it("rejects an empty credit response", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("session=test")
    ctx.host.providerConfig = { get: vi.fn(() => "qoder.com") }
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "{}" })
    expect(() => plugin.probe(ctx)).toThrow("missing credit data")
  })
})
