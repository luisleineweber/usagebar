import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function setEnv(ctx, values) {
  ctx.host.env.get.mockImplementation((key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null
  )
}

function response(bodyText, status = 200) {
  return { status, bodyText, headers: {} }
}

function costsPayload() {
  return {
    data: [
      {
        start_time: Date.parse("2026-03-05T00:00:00.000Z") / 1000,
        results: [{ amount: { value: 2.5, currency: "usd" } }],
      },
      {
        start_time: Date.parse("2026-03-06T00:00:00.000Z") / 1000,
        results: [{ amount: { value: 1.25, currency: "usd" } }],
      },
      {
        start_time: Date.parse("2026-02-10T00:00:00.000Z") / 1000,
        results: [{ amount: { value: 4, currency: "usd" } }],
      },
    ],
  }
}

function usagePayload() {
  return {
    data: [
      {
        start_time: Date.parse("2026-03-06T00:00:00.000Z") / 1000,
        results: [
          {
            model: "gpt-4.1",
            input_tokens: 1200,
            output_tokens: 300,
            num_model_requests: 4,
          },
          {
            model: "gpt-5-mini",
            input_tokens: 1000000,
            output_tokens: 500000,
            num_model_requests: 8,
          },
        ],
      },
    ],
  }
}

function mockOpenAiRequests(ctx) {
  ctx.host.http.request.mockImplementation((request) => {
    if (request.url.startsWith("https://api.openai.com/v1/organization/costs")) {
      return response(JSON.stringify(costsPayload()))
    }
    if (request.url.startsWith("https://api.openai.com/v1/organization/usage/completions")) {
      return response(JSON.stringify(usagePayload()))
    }
    return response("{}", 404)
  })
}

describe("openai-api plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("throws when no admin API key is configured", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow(
      "OpenAI Admin API key missing. Save it in Setup or set OPENAI_ADMIN_API_KEY."
    )
  })

  it("prefers stored provider secret over env", async () => {
    const ctx = makeCtx()
    ctx.nowIso = "2026-03-06T12:00:00.000Z"
    ctx.host.providerSecrets.read.mockImplementation((key) =>
      key === "apiKey" ? "stored-key" : null
    )
    setEnv(ctx, { OPENAI_ADMIN_API_KEY: "env-key" })
    mockOpenAiRequests(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request.mock.calls[0][0].headers.Authorization).toBe("Bearer stored-key")
  })

  it("uses the organization costs and completions usage endpoints", async () => {
    const ctx = makeCtx()
    ctx.nowIso = "2026-03-06T12:00:00.000Z"
    setEnv(ctx, { OPENAI_ADMIN_API_KEY: "admin-key" })
    mockOpenAiRequests(ctx)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(ctx.host.http.request.mock.calls[0][0].url).toContain("/v1/organization/costs")
    expect(ctx.host.http.request.mock.calls[0][0].url).toContain("bucket_width=1d")
    expect(ctx.host.http.request.mock.calls[1][0].url).toContain(
      "/v1/organization/usage/completions"
    )
    expect(ctx.host.http.request.mock.calls[1][0].url).toContain("group_by[]=model")
    expect(result.plan).toBe("API spend: $7.75 / 30 days")
    expect(result.lines.find((line) => line.label === "Today")).toMatchObject({
      value: "$1.25",
      subtitle: "OpenAI API spend",
    })
    expect(result.lines.find((line) => line.label === "7 days")?.value).toBe("$3.75")
    expect(result.lines.find((line) => line.label === "30 days")?.value).toBe("$7.75")
    expect(result.lines.find((line) => line.label === "Tokens")).toMatchObject({
      value: "1.5M total",
      subtitle: "1.0M in / 500K out",
    })
    expect(result.lines.find((line) => line.label === "Requests")?.value).toBe("12")
    expect(result.lines.find((line) => line.label === "Top model")).toMatchObject({
      value: "gpt-5-mini",
      subtitle: "1.5M tokens",
    })
    expect(result.history).toMatchObject({
      version: 1,
      source: "openai-organization",
      timeZone: "UTC",
    })
    expect(result.history.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          periodStart: "2026-03-06T00:00:00.000Z",
          costUsd: 1.25,
        }),
        expect.objectContaining({
          periodStart: "2026-03-06T00:00:00.000Z",
          model: "gpt-5-mini",
          inputTokens: 1000000,
          outputTokens: 500000,
          totalTokens: 1500000,
          requests: 8,
        }),
      ])
    )
  })

  it("falls back to OPENAI_API_KEY when admin-specific env is absent", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { OPENAI_API_KEY: "fallback-key" })
    mockOpenAiRequests(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request.mock.calls[0][0].headers.Authorization).toBe("Bearer fallback-key")
  })

  it("throws a precise auth error", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { OPENAI_ADMIN_API_KEY: "bad-key" })
    ctx.host.http.request.mockReturnValue(response("", 401))

    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow(
      "OpenAI Admin API key is invalid or lacks organization usage permissions."
    )
  })

  it("declares manifest lines and OpenAI API capability", () => {
    const manifest = JSON.parse(readFileSync("plugins/openai-api/plugin.json", "utf8"))

    expect(manifest.capabilities.httpDomains).toEqual(["api.openai.com"])
    expect(manifest.lines).toEqual(
      expect.arrayContaining([
        { type: "text", label: "Today", scope: "overview", primaryOrder: 1 },
        { type: "text", label: "30 days", scope: "detail" },
        { type: "text", label: "Top model", scope: "detail" },
      ])
    )
  })
})
