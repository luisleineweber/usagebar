import { beforeEach, describe, expect, it, vi } from "vitest"
import { makePluginTestContext } from "../test-helpers.js"

async function loadPlugin() {
  vi.resetModules()
  delete globalThis.__openusage_plugin
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

describe("alibaba plugin", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("throws when no API key is configured", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()

    expect(() => plugin.probe(ctx)).toThrow("Alibaba API key missing")
  })

  it("renders request-count quota bars from the API response", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "apiKey" ? "sk-sp-test" : null))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        data: {
          plan: "Pro",
          fiveHourQuota: { used: 120, limit: 6000, resetsAt: "2026-05-12T13:00:00+08:00" },
          weeklyQuota: { used: 1000, limit: 45000, resetsAt: "2026-05-18T00:00:00+08:00" },
          monthlyQuota: { used: 12000, limit: 90000, resetsAt: "2026-06-12T00:00:00+08:00" },
        },
      }),
    })

    const result = plugin.probe(ctx)

    expect(ctx.host.http.request.mock.calls[0][0].headers.Authorization).toBe("Bearer sk-sp-test")
    expect(ctx.host.http.request.mock.calls[0][0].url).toBe("https://devops.cn-beijing.aliyuncs.com/webapi/codingplan/quotas")
    expect(result.plan).toBe("Pro")
    expect(result.lines.find((line) => line.label === "5-hour")).toMatchObject({
      type: "progress",
      used: 120,
      limit: 6000,
      format: { kind: "count", suffix: "requests" },
      resetsAt: "2026-05-12T05:00:00.000Z",
      periodDurationMs: 5 * 60 * 60 * 1000,
    })
    expect(result.lines.find((line) => line.label === "Weekly")).toMatchObject({
      type: "progress",
      used: 1000,
      limit: 45000,
      format: { kind: "count", suffix: "requests" },
    })
    expect(result.lines.find((line) => line.label === "Monthly")).toMatchObject({
      type: "progress",
      used: 12000,
      limit: 90000,
      format: { kind: "count", suffix: "requests" },
    })
    expect(result.lines.find((line) => line.label === "Plan")).toMatchObject({ type: "badge", text: "Pro" })
  })

  it("uses current documented plan limits when a known plan omits limits", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "ALIBABA_API_KEY") return "env-key"
      if (name === "ALIBABA_REGION") return "us-east-1"
      return null
    })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        data: {
          plan: "Coding Plan Lite",
          five_hour_quota: { used: 100 },
          weekly: { used: 2000 },
          monthly: { used: 3000 },
        },
      }),
    })

    const result = plugin.probe(ctx)

    expect(ctx.host.http.request.mock.calls[0][0].url).toBe("https://devops.aliyuncs.com/webapi/codingplan/quotas")
    expect(result.lines.find((line) => line.label === "5-hour")).toMatchObject({ used: 100, limit: 1200 })
    expect(result.lines.find((line) => line.label === "Weekly")).toMatchObject({ used: 2000, limit: 9000 })
    expect(result.lines.find((line) => line.label === "Monthly")).toMatchObject({ used: 3000, limit: 18000 })
  })

  it("keeps provider limits when usage exceeds the quota", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "apiKey" ? "sk-sp-test" : null))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        data: {
          plan: "Pro",
          fiveHourQuota: { used: 6500, limit: 6000 },
        },
      }),
    })

    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "5-hour")).toMatchObject({
      type: "progress",
      used: 6500,
      limit: 6000,
    })
  })

  it("maps auth failures to a setup error", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "apiKey" ? "bad-key" : null))
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "" })

    expect(() => plugin.probe(ctx)).toThrow("Alibaba API key invalid")
  })
})
