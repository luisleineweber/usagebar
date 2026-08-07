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

    expect(() => plugin.probe(ctx)).toThrow("Alibaba credentials missing")
  })

  it("renders Bailian Token Plan credits from a stored cookie", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockImplementation((key) =>
      key === "cookieHeader" ? "login=ticket; sec_token=csrf" : null
    )
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        Success: true,
        Data: {
          TotalCount: 1,
          TotalValue: 1000,
          TotalSurplusValue: 875,
          NearestExpireDate: 1701000000000,
        },
      }),
    })
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Token credits")).toMatchObject({
      used: 125,
      limit: 1000,
      resetsAt: "2023-11-26T12:00:00.000Z",
    })
    const request = ctx.host.http.request.mock.calls[0][0]
    expect(request.url).toContain("GetSubscriptionSummary")
    expect(request.bodyText).toContain("sec_token=csrf")
  })

  it("keeps an authoritative empty Token Plan visible", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockImplementation((key) =>
      key === "cookieHeader" ? "login=ticket; sec_token=csrf" : null
    )
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        Success: true,
        Data: { TotalCount: 0, TotalValue: 0, TotalSurplusValue: 0 },
      }),
    })
    expect(plugin.probe(ctx).lines.find((line) => line.label === "Plan")).toMatchObject({
      text: "No active Token Plan",
    })
  })

  it("renders request-count quota bars from the API response", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockImplementation((key) =>
      key === "apiKey" ? "sk-sp-test" : null
    )
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
    expect(ctx.host.http.request.mock.calls[0][0].url).toBe(
      "https://devops.cn-beijing.aliyuncs.com/webapi/codingplan/quotas"
    )
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
    expect(result.lines.find((line) => line.label === "Plan")).toMatchObject({
      type: "badge",
      text: "Pro",
    })
    expect(result.lines.find((line) => line.label === "Source")).toEqual({
      type: "text",
      label: "Source",
      value: "Alibaba Coding Plan quota endpoint",
    })
    expect(result.lines.find((line) => line.label === "Auth source")).toEqual({
      type: "text",
      label: "Auth source",
      value: "Stored API key",
    })
    expect(result.lines.find((line) => line.label === "Endpoint")).toEqual({
      type: "text",
      label: "Endpoint",
      value: "https://devops.cn-beijing.aliyuncs.com/webapi/codingplan/quotas",
    })
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

    expect(ctx.host.http.request.mock.calls[0][0].url).toBe(
      "https://devops.aliyuncs.com/webapi/codingplan/quotas"
    )
    expect(result.lines.find((line) => line.label === "5-hour")).toMatchObject({
      used: 100,
      limit: 1200,
    })
    expect(result.lines.find((line) => line.label === "Weekly")).toMatchObject({
      used: 2000,
      limit: 9000,
    })
    expect(result.lines.find((line) => line.label === "Monthly")).toMatchObject({
      used: 3000,
      limit: 18000,
    })
    expect(result.lines.find((line) => line.label === "Auth source")?.value).toBe("ALIBABA_API_KEY")
  })

  it("keeps provider limits when usage exceeds the quota", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockImplementation((key) =>
      key === "apiKey" ? "sk-sp-test" : null
    )
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

  it("maps console-session-walled responses to a specific setup error", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockImplementation((key) =>
      key === "apiKey" ? "sk-sp-test" : null
    )
    ctx.host.http.request.mockReturnValue({
      status: 403,
      bodyText: JSON.stringify({ code: "ConsoleNeedLogin", message: "ConsoleNeedLogin" }),
    })

    expect(() => plugin.probe(ctx)).toThrow("requires a browser console session")
  })

  it("does not invent limits for unknown plans without quota limits", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockImplementation((key) =>
      key === "apiKey" ? "sk-sp-test" : null
    )
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        data: {
          plan: "Unknown Preview Plan",
          fiveHourQuota: { used: 100 },
          weeklyQuota: { used: 200 },
          monthlyQuota: { used: 300 },
        },
      }),
    })

    expect(() => plugin.probe(ctx)).toThrow("missing usage data")
  })

  it("maps Coding Plan network, server, and invalid response failures", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockImplementation((key) =>
      key === "apiKey" ? "sk-sp-test" : null
    )

    ctx.host.http.request.mockImplementation(() => {
      throw new Error("offline")
    })
    expect(() => plugin.probe(ctx)).toThrow("Check your connection")
    expect(ctx.host.log.error).toHaveBeenCalledWith(expect.stringContaining("offline"))

    ctx.host.http.request.mockReturnValue({ status: 503, bodyText: "" })
    expect(() => plugin.probe(ctx)).toThrow("HTTP 503")

    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "not-json" })
    expect(() => plugin.probe(ctx)).toThrow("response invalid")
  })
})
