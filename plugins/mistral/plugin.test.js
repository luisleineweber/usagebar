import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

const usagePayload = {
  completion: {
    models: {
      "mistral-large-latest::mistral-large-2411": {
        input: [
          {
            billing_metric: "mistral-large-2411",
            billing_group: "input",
            value: 11121,
            value_paid: 11121,
          },
        ],
        output: [
          {
            billing_metric: "mistral-large-2411",
            billing_group: "output",
            value: 1115,
            value_paid: 1115,
          },
        ],
      },
      "mistral-small-latest::mistral-small-2506": {
        input: [
          {
            billing_metric: "mistral-small-2506",
            billing_group: "input",
            value: 20,
            value_paid: 20,
          },
          {
            billing_metric: "mistral-small-2506",
            billing_group: "input",
            value: 100,
            value_paid: 100,
          },
        ],
        output: [
          {
            billing_metric: "mistral-small-2506",
            billing_group: "output",
            value: 500,
            value_paid: 500,
          },
          {
            billing_metric: "mistral-small-2506",
            billing_group: "output",
            value: 2482,
            value_paid: 2482,
          },
        ],
      },
    },
  },
  ocr: { models: {} },
  connectors: { models: {} },
  libraries_api: { pages: { models: {} }, tokens: { models: {} } },
  fine_tuning: { training: {}, storage: {} },
  audio: { models: {} },
  currency: "EUR",
  currency_symbol: "€",
  prices: [
    { billing_metric: "mistral-large-2411", billing_group: "input", price: "0.0000017000" },
    { billing_metric: "mistral-large-2411", billing_group: "output", price: "0.0000051000" },
    { billing_metric: "mistral-small-2506", billing_group: "input", price: "8.50E-8" },
    { billing_metric: "mistral-small-2506", billing_group: "output", price: "2.550E-7" },
  ],
}

describe("mistral plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("throws when no cookie header is configured", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Not logged in")
  })

  it("fetches current monthly usage and computes cost", async () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read.mockReturnValue("ory_session_x=abc; csrftoken=csrf")
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(usagePayload),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("EUR")
    expect(result.lines.find((line) => line.label === "Input tokens")?.value).toBe("11,241")
    expect(result.lines.find((line) => line.label === "Output tokens")?.value).toBe("4,097")
    expect(result.lines.find((line) => line.label === "Models")?.value).toBe("2")
    expect(result.lines.find((line) => line.label === "Spend")?.value).toContain("€0.0254")
    expect(ctx.host.http.request).toHaveBeenCalledWith(expect.objectContaining({
      method: "GET",
      url: expect.stringContaining("https://admin.mistral.ai/api/billing/v2/usage?"),
      headers: expect.objectContaining({
        Cookie: "ory_session_x=abc; csrftoken=csrf",
        "X-CSRFTOKEN": "csrf",
      }),
    }))
  })

  it("uses MISTRAL_COOKIE_HEADER before stored secrets", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "MISTRAL_COOKIE_HEADER") return "ory_session_x=env"
      return null
    })
    ctx.host.providerSecrets.read.mockReturnValue("ory_session_x=stored")
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ completion: { models: {} }, prices: [] }),
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({ Cookie: "ory_session_x=env" }),
    }))
  })

  it("throws session expired on auth status", async () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read.mockReturnValue("ory_session_x=abc")
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Session expired")
  })
})
