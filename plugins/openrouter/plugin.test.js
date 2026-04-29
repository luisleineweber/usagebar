import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function setEnv(ctx, envValues) {
  ctx.host.env.get.mockImplementation((name) =>
    Object.prototype.hasOwnProperty.call(envValues, name) ? envValues[name] : null
  )
}

function creditsPayload(overrides) {
  return {
    data: {
      total_credits: 100,
      total_usage: 40,
      ...overrides,
    },
  }
}

function keyPayload(overrides) {
  return {
    data: {
      limit: 20,
      usage: 0.5,
      rate_limit: {
        requests: 120,
        interval: "10s",
      },
      ...overrides,
    },
  }
}

describe("openrouter plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("throws when no API key is configured", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(
      "OpenRouter management key missing. Save it in Setup or set OPENROUTER_API_KEY."
    )
  })

  it("prefers the stored provider secret over env", async () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "apiKey" ? "secret-key" : null))
    setEnv(ctx, { OPENROUTER_API_KEY: "env-key" })
    ctx.host.http.request.mockImplementation((req) => {
      if (req.url === "https://openrouter.ai/api/v1/credits") {
        return { status: 200, bodyText: JSON.stringify(creditsPayload()) }
      }
      return { status: 200, bodyText: JSON.stringify(keyPayload()) }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    const creditsCall = ctx.host.http.request.mock.calls[0][0]
    expect(creditsCall.headers.Authorization).toBe("Bearer secret-key")
    expect(creditsCall.headers["X-Title"]).toBe("UsageBar")
  })

  it("falls back to OPENROUTER_API_KEY when no stored secret exists", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { OPENROUTER_API_KEY: "env-key" })
    ctx.host.http.request.mockImplementation((req) => {
      if (req.url === "https://openrouter.ai/api/v1/credits") {
        return { status: 200, bodyText: JSON.stringify(creditsPayload()) }
      }
      return { status: 200, bodyText: JSON.stringify(keyPayload()) }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Balance: $60.00")
    expect(result.lines.find((line) => line.label === "Credits")).toBeTruthy()
  })

  it("uses OPENROUTER_API_URL when set", async () => {
    const ctx = makeCtx()
    setEnv(ctx, {
      OPENROUTER_API_KEY: "env-key",
      OPENROUTER_API_URL: " https://openrouter.test/api/v1/ ",
    })
    ctx.host.http.request.mockImplementation((req) => {
      if (req.url === "https://openrouter.test/api/v1/credits") {
        return { status: 200, bodyText: JSON.stringify(creditsPayload()) }
      }
      if (req.url === "https://openrouter.test/api/v1/key") {
        return { status: 200, bodyText: JSON.stringify(keyPayload()) }
      }
      return { status: 404, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request.mock.calls[0][0].url).toBe("https://openrouter.test/api/v1/credits")
    expect(ctx.host.http.request.mock.calls[1][0].url).toBe("https://openrouter.test/api/v1/key")
  })

  it("renders credits as dollars progress and requests as rate limit text", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { OPENROUTER_API_KEY: "env-key" })
    ctx.host.http.request.mockImplementation((req) => {
      if (req.url.endsWith("/credits")) {
        return { status: 200, bodyText: JSON.stringify(creditsPayload({ total_credits: 50, total_usage: 45.5 })) }
      }
      return { status: 200, bodyText: JSON.stringify(keyPayload({ rate_limit: { requests: 300, interval: "1m" } })) }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const creditsLine = result.lines.find((line) => line.label === "Credits")
    expect(creditsLine).toEqual({
      type: "progress",
      label: "Credits",
      used: 45.5,
      limit: 50,
      format: { kind: "dollars" },
    })
    expect(result.lines.find((line) => line.label === "Requests")).toEqual({
      type: "text",
      label: "Requests",
      value: "300 / 1m",
    })
  })

  it("falls back to key-credit text when rate-limit info is missing", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { OPENROUTER_API_KEY: "env-key" })
    ctx.host.http.request.mockImplementation((req) => {
      if (req.url.endsWith("/credits")) {
        return { status: 200, bodyText: JSON.stringify(creditsPayload()) }
      }
      return { status: 200, bodyText: JSON.stringify(keyPayload({ rate_limit: null, limit: 5, usage: 1.25 })) }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Requests")?.value).toBe("$3.75 key credit left")
  })

  it("shows no key limit configured when key endpoint returns no quota", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { OPENROUTER_API_KEY: "env-key" })
    ctx.host.http.request.mockImplementation((req) => {
      if (req.url.endsWith("/credits")) {
        return { status: 200, bodyText: JSON.stringify(creditsPayload()) }
      }
      return { status: 200, bodyText: JSON.stringify({ data: { limit: null, usage: null } }) }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Requests")?.value).toBe("No key limit configured")
  })

  it("treats key endpoint failures as non-fatal", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { OPENROUTER_API_KEY: "env-key" })
    ctx.host.http.request.mockImplementation((req) => {
      if (req.url.endsWith("/credits")) {
        return { status: 200, bodyText: JSON.stringify(creditsPayload()) }
      }
      return { status: 500, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Requests")?.value).toBe("Unavailable")
  })

  it("throws a precise auth error for credits auth failures", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { OPENROUTER_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(
      "OpenRouter credits requires a management key. Check Setup or OPENROUTER_API_KEY."
    )
  })

  it("throws for invalid credits JSON", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { OPENROUTER_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "not-json" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("OpenRouter response invalid. Try again later.")
  })

  it("throws when credits totals are missing from the response", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { OPENROUTER_API_KEY: "env-key" })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: JSON.stringify({ data: {} }) })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("OpenRouter credits response missing totals. Try again later.")
  })
})
