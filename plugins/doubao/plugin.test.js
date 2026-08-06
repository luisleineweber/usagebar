import { beforeEach, describe, expect, it, vi } from "vitest"
import { makePluginTestContext } from "../test-helpers.js"

async function loadPlugin() {
  vi.resetModules()
  delete globalThis.__openusage_plugin
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

describe("doubao plugin", () => {
  beforeEach(() => vi.restoreAllMocks())

  it("maps authoritative request headers", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("ark-key")
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: {
        "X-RateLimit-Remaining-Requests": "80",
        "x-ratelimit-limit-requests": "100",
        "x-ratelimit-reset-requests": "1h",
      },
      bodyText: "{}",
    })
    const result = plugin.probe(ctx)
    expect(result.lines[0]).toMatchObject({ type: "progress", used: 20, limit: 100 })
    expect(result.lines[0].resetsAt).toBe("2026-02-02T01:00:00.000Z")
    expect(ctx.host.http.request.mock.calls[0][0].bodyText).toContain('"max_tokens":1')
  })

  it("keeps missing headers unknown", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.env.get.mockImplementation((name) => (name === "DOUBAO_API_KEY" ? "env-key" : null))
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    expect(plugin.probe(ctx).lines.some((line) => line.type === "progress")).toBe(false)
  })

  it("reports auth failure", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockReturnValue("bad")
    ctx.host.http.request.mockReturnValue({ status: 401, headers: {}, bodyText: "" })
    expect(() => plugin.probe(ctx)).toThrow("API key invalid")
  })
})
