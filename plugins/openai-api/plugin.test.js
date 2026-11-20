import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"
import { summarizeUsageHistory } from "../../src/lib/usage-history"

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
          scope: "cost",
          costUsd: 1.25,
        }),
        expect.objectContaining({
          periodStart: "2026-03-06T00:00:00.000Z",
          scope: "usage",
          model: "gpt-5-mini",
          inputTokens: 1000000,
          outputTokens: 500000,
          totalTokens: 1500000,
          requests: 8,
        }),
      ])
    )
  })

  it("requests history from the month start on the 31st without widening 30-day lines", async () => {
    const ctx = makeCtx()
    ctx.nowIso = "2026-07-31T12:00:00.000Z"
    setEnv(ctx, { OPENAI_ADMIN_API_KEY: "admin-key" })
    const july1 = Date.parse("2026-07-01T00:00:00.000Z") / 1000
    const july31 = Date.parse("2026-07-31T00:00:00.000Z") / 1000
    ctx.host.http.request.mockImplementation((request) => {
      if (request.url.includes("/v1/organization/costs")) {
        return response(
          JSON.stringify({
            data: [
              { start_time: july1, results: [{ amount: { value: 100, currency: "usd" } }] },
              { start_time: july31, results: [{ amount: { value: 5, currency: "usd" } }] },
            ],
          })
        )
      }
      return response(
        JSON.stringify({
          data: [
            {
              start_time: july1,
              results: [
                { model: "gpt-old", input_tokens: 900, output_tokens: 100, num_model_requests: 3 },
              ],
            },
            {
              start_time: july31,
              results: [
                { model: "gpt-5", input_tokens: 10, output_tokens: 5, num_model_requests: 1 },
              ],
            },
          ],
        })
      )
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    for (const [request] of ctx.host.http.request.mock.calls) {
      expect(request.url).toContain(`start_time=${july1}`)
    }
    expect(result.lines.find((line) => line.label === "30 days")?.value).toBe("$5.00")
    expect(result.lines.find((line) => line.label === "Tokens")?.value).toBe("15 total")
    expect(result.lines.find((line) => line.label === "Top model")?.value).toBe("gpt-5")

    const outputs = [{ providerId: "openai-api", history: result.history }]
    const nowMs = Date.parse(ctx.nowIso)
    const totals = (period) =>
      summarizeUsageHistory(outputs, { period, nowMs, timeZone: "UTC" }).totals
    expect(totals("monthToDate")).toMatchObject({ costUsd: 105, totalTokens: 1015 })
    expect(totals("30d")).toMatchObject({ costUsd: 5, totalTokens: 15 })
    expect(totals("weekToDate")).toMatchObject({ costUsd: 5, totalTokens: 15 })
  })

  function mockPayloads(ctx, costResults, usageResults) {
    const day = Date.parse("2026-07-31T00:00:00.000Z") / 1000
    ctx.host.http.request.mockImplementation((request) =>
      response(
        JSON.stringify({
          data: [
            {
              start_time: day,
              results: request.url.includes("/v1/organization/costs") ? costResults : usageResults,
            },
          ],
        })
      )
    )
  }

  it("fails the probe when a cost row omits its amount", async () => {
    const ctx = makeCtx()
    ctx.nowIso = "2026-07-31T12:00:00.000Z"
    setEnv(ctx, { OPENAI_ADMIN_API_KEY: "admin-key" })
    mockPayloads(ctx, [{ amount: { currency: "usd" } }], [])

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("OpenAI cost response has a row without an amount.")
  })

  it.each([
    ["input tokens", { model: "gpt-5", output_tokens: 15, num_model_requests: 1 }],
    ["output tokens", { model: "gpt-5", input_tokens: 15, num_model_requests: 1 }],
    ["requests", { model: "gpt-5", input_tokens: 10, output_tokens: 5 }],
  ])("fails the probe when a usage row omits %s", async (_field, usageRow) => {
    const ctx = makeCtx()
    ctx.nowIso = "2026-07-31T12:00:00.000Z"
    setEnv(ctx, { OPENAI_ADMIN_API_KEY: "admin-key" })
    mockPayloads(ctx, [{ amount: { value: 1, currency: "usd" } }], [usageRow])

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(
      "OpenAI usage response has a row without input tokens, output tokens, or requests."
    )
  })

  it("keeps explicit zero cost, tokens, and requests as zero", async () => {
    const ctx = makeCtx()
    ctx.nowIso = "2026-07-31T12:00:00.000Z"
    setEnv(ctx, { OPENAI_ADMIN_API_KEY: "admin-key" })
    mockPayloads(
      ctx,
      [{ amount: { value: "0.00", currency: "usd" } }],
      [{ model: "gpt-5", input_tokens: 0, output_tokens: 7, num_model_requests: 0, requests: 9 }]
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Today")?.value).toBe("$0.00")
    expect(result.lines.find((line) => line.label === "Requests")?.value).toBe("0")
    expect(result.history.entries).toEqual([
      expect.objectContaining({ scope: "cost", costUsd: 0 }),
      expect.objectContaining({ scope: "usage", inputTokens: 0, outputTokens: 7, requests: 0 }),
    ])
  })

  it("keeps the 30-day request window when it already covers the month start", async () => {
    const ctx = makeCtx()
    ctx.nowIso = "2026-07-10T12:00:00.000Z"
    setEnv(ctx, { OPENAI_ADMIN_API_KEY: "admin-key" })
    mockOpenAiRequests(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    const start30 = Date.parse("2026-06-11T00:00:00.000Z") / 1000
    expect(ctx.host.http.request.mock.calls[0][0].url).toContain(`start_time=${start30}`)
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
