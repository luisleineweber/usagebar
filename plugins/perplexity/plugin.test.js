import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function mockCreditsEndpoint(ctx, payload, status = 200) {
  ctx.host.http.request.mockImplementation((req) => {
    expect(req.url).toBe("https://www.perplexity.ai/rest/billing/credits")
    return {
      status,
      headers: {},
      bodyText: typeof payload === "string" ? payload : JSON.stringify(payload),
    }
  })
}

describe("perplexity plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("throws when no cookie auth is available", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Not logged in")
  })

  it("prefers PERPLEXITY_COOKIE_HEADER over other sources", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "PERPLEXITY_COOKIE_HEADER") return "header-cookie=1"
      if (name === "PERPLEXITY_COOKIE") return "raw-cookie=1"
      if (name === "PERPLEXITY_SESSION_TOKEN") return "session-token"
      return null
    })
    ctx.host.providerSecrets.read.mockImplementation(() => "stored-cookie=1")
    mockCreditsEndpoint(ctx, {
      grants: [{ kind: "recurring", totalCredits: 3000, remainingCredits: 2400 }],
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request.mock.calls[0][0].headers.Cookie).toBe("header-cookie=1")
  })

  it("uses PERPLEXITY_COOKIE when the explicit header env var is absent", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation((name) => (name === "PERPLEXITY_COOKIE" ? "raw-cookie=1" : null))
    mockCreditsEndpoint(ctx, {
      grants: [{ kind: "recurring", totalCredits: 2000, remainingCredits: 1500 }],
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request.mock.calls[0][0].headers.Cookie).toBe("raw-cookie=1")
  })

  it("uses stored cookie header when env vars are absent", async () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "cookieHeader" ? "stored-cookie=1" : null))
    mockCreditsEndpoint(ctx, {
      grants: [{ kind: "recurring", totalCredits: 2000, remainingCredits: 1900 }],
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request.mock.calls[0][0].headers.Cookie).toBe("stored-cookie=1")
  })

  it("falls back to PERPLEXITY_SESSION_TOKEN when needed", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation((name) =>
      name === "PERPLEXITY_SESSION_TOKEN" ? "token-123" : null
    )
    mockCreditsEndpoint(ctx, {
      grants: [{ kind: "recurring", totalCredits: 2000, remainingCredits: 1000 }],
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request.mock.calls[0][0].headers.Cookie).toBe(
      "__Secure-next-auth.session-token=token-123"
    )
  })

  it("parses recurring, purchased, and bonus pools", async () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "cookieHeader" ? "stored-cookie=1" : null))
    mockCreditsEndpoint(ctx, {
      grants: [
        { kind: "recurring", totalCredits: 3000, remainingCredits: 2250 },
        { kind: "purchased", totalCredits: 500, remainingCredits: 125 },
        { kind: "bonus", totalCredits: 75, remainingCredits: 25 },
      ],
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBeUndefined()
    expect(result.lines.map((line) => line.label)).toEqual([
      "Recurring credits",
      "Purchased credits",
      "Bonus credits",
    ])
    expect(result.lines[0].used).toBe(750)
    expect(result.lines[0].limit).toBe(3000)
    expect(result.lines[1].used).toBe(375)
    expect(result.lines[2].used).toBe(50)
  })

  it("aggregates nested grants without inferring a plan from recurring pool size", async () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "cookieHeader" ? "stored-cookie=1" : null))
    mockCreditsEndpoint(ctx, {
      data: {
        grants: [
          { type: "subscription", total: 8000, remaining: 2000 },
          { type: "recurring", total: 4000, remaining: 1000 },
        ],
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBeUndefined()
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].label).toBe("Recurring credits")
    expect(result.lines[0].used).toBe(9000)
    expect(result.lines[0].limit).toBe(12000)
  })

  it("renders zero-value pools as depleted instead of full", async () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "cookieHeader" ? "stored-cookie=1" : null))
    mockCreditsEndpoint(ctx, {
      grants: [
        { kind: "bonus", totalCredits: 0, remainingCredits: 0 },
      ],
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].label).toBe("Bonus credits")
    expect(result.lines[0].used).toBe(1)
    expect(result.lines[0].limit).toBe(1)
  })

  it("throws a clear session error on unauthorized responses", async () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "cookieHeader" ? "stored-cookie=1" : null))
    mockCreditsEndpoint(ctx, {}, 401)

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Session expired")
  })

  it("throws on malformed JSON", async () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "cookieHeader" ? "stored-cookie=1" : null))
    mockCreditsEndpoint(ctx, "{bad")

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage response invalid")
  })

  it("throws when payload has no recognizable credit pools", async () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "cookieHeader" ? "stored-cookie=1" : null))
    mockCreditsEndpoint(ctx, {
      grants: [{ kind: "other", totalCredits: 10, remainingCredits: 5 }],
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage response missing credit pools")
  })
})
