import { beforeEach, describe, expect, it, vi } from "vitest"
import { makePluginTestContext } from "../test-helpers.js"

async function loadPlugin() {
  vi.resetModules()
  delete globalThis.__openusage_plugin
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

describe("codebuff plugin", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("throws when no token is configured", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()

    expect(() => plugin.probe(ctx)).toThrow("Codebuff API token missing")
  })

  it("prefers the stored provider secret over env and credentials file", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "apiKey" ? "stored-token" : null))
    ctx.host.env.get.mockImplementation((name) => (name === "CODEBUFF_API_KEY" ? "env-token" : null))
    ctx.host.fs.writeText("~/.config/manicode/credentials.json", JSON.stringify({
      default: { authToken: "file-token" },
    }))
    ctx.host.http.request.mockImplementation((opts) => {
      if (opts.url.endsWith("/api/v1/usage")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            usage: 125,
            quota: 500,
            remainingBalance: 375,
            next_quota_reset: "2026-05-18T00:00:00Z",
            autoTopupEnabled: true,
          }),
        }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({
          email: "dev@example.com",
          subscription: { displayName: "pro", status: "active" },
          rateLimit: {
            weeklyUsed: 20,
            weeklyLimit: 100,
            weeklyResetsAt: "2026-05-17T00:00:00Z",
          },
        }),
      }
    })

    const result = plugin.probe(ctx)

    expect(ctx.host.http.request.mock.calls[0][0].headers.Authorization).toBe("Bearer stored-token")
    expect(result.account).toBe("dev@example.com")
    expect(result.plan).toBe("Pro · 375 remaining · auto top-up")
    expect(result.lines.find((line) => line.label === "Credits")).toMatchObject({
      type: "progress",
      used: 125,
      limit: 500,
      format: { kind: "count", suffix: "credits" },
      resetsAt: "2026-05-18T00:00:00.000Z",
    })
    expect(result.lines.find((line) => line.label === "Weekly")).toMatchObject({
      type: "progress",
      used: 20,
      limit: 100,
      format: { kind: "count", suffix: "credits" },
      resetsAt: "2026-05-17T00:00:00.000Z",
    })
  })

  it("falls back to CODEBUFF_API_KEY", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.env.get.mockImplementation((name) => (name === "CODEBUFF_API_KEY" ? "env-token" : null))
    ctx.host.http.request.mockImplementation((opts) => {
      if (opts.url.endsWith("/api/v1/usage")) {
        return { status: 200, bodyText: JSON.stringify({ used: 10, limit: 50 }) }
      }
      return { status: 404, bodyText: "{}" }
    })

    const result = plugin.probe(ctx)

    expect(ctx.host.http.request.mock.calls[0][0].headers.Authorization).toBe("Bearer env-token")
    expect(result.lines.find((line) => line.label === "Credits")).toMatchObject({ used: 10, limit: 50 })
    expect(result.lines.find((line) => line.label === "Weekly")).toBeUndefined()
  })

  it("falls back to codebuff login credentials", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.fs.writeText("~/.config/manicode/credentials.json", JSON.stringify({
      default: { authToken: "credential-token" },
    }))
    ctx.host.http.request.mockImplementation((opts) => {
      if (opts.url.endsWith("/api/v1/usage")) {
        return { status: 200, bodyText: JSON.stringify({ usage: 40, remainingBalance: 60 }) }
      }
      return { status: 200, bodyText: JSON.stringify({}) }
    })

    const result = plugin.probe(ctx)

    expect(ctx.host.http.request.mock.calls[0][0].headers.Authorization).toBe("Bearer credential-token")
    expect(result.lines.find((line) => line.label === "Credits")).toMatchObject({ used: 40, limit: 100 })
  })

  it("renders used-only credits as text instead of fake progress", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "apiKey" ? "token" : null))
    ctx.host.http.request.mockImplementation((opts) => {
      if (opts.url.endsWith("/api/v1/usage")) {
        return { status: 200, bodyText: JSON.stringify({ usage: 40 }) }
      }
      return { status: 404, bodyText: "{}" }
    })

    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Credits")).toMatchObject({
      type: "text",
      value: "40 credits used",
    })
  })

  it("keeps provider max values even when usage exceeds them", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "apiKey" ? "token" : null))
    ctx.host.http.request.mockImplementation((opts) => {
      if (opts.url.endsWith("/api/v1/usage")) {
        return { status: 200, bodyText: JSON.stringify({ usage: 120, quota: 100 }) }
      }
      return {
        status: 200,
        bodyText: JSON.stringify({
          rateLimit: { weeklyUsed: 55, weeklyLimit: 50 },
        }),
      }
    })

    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Credits")).toMatchObject({
      type: "progress",
      used: 120,
      limit: 100,
    })
    expect(result.lines.find((line) => line.label === "Weekly")).toMatchObject({
      type: "progress",
      used: 55,
      limit: 50,
    })
  })

  it("maps auth failures to a setup error", async () => {
    const plugin = await loadPlugin()
    const ctx = makePluginTestContext()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "apiKey" ? "bad-token" : null))
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "{}" })

    expect(() => plugin.probe(ctx)).toThrow("Codebuff API token invalid")
  })
})
