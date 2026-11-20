import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const USAGE_URL = "https://api.factory.ai/api/organization/subscription/usage?useCache=true"
const API_KEY = "fk-test-0123456789abcdef"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function makeJwt(expSeconds) {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const payload = btoa(JSON.stringify({ exp: expSeconds }))
  return `${header}.${payload}.signature`
}

function writeLocalSession(ctx) {
  const futureExp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
  ctx.host.fs.writeText(
    "~/.factory/auth.json",
    JSON.stringify({ access_token: makeJwt(futureExp), refresh_token: "refresh" })
  )
}

function storeApiKey(ctx, value) {
  ctx.host.providerSecrets.read.mockImplementation((key) => {
    if (key === "apiKey") return value
    throw new Error("provider secret not found")
  })
}

function missingSecret(ctx) {
  ctx.host.providerSecrets.read.mockImplementation(() => {
    throw new Error("provider secret not found")
  })
}

function usageResponse(usage, status = 200) {
  return { status, headers: {}, bodyText: JSON.stringify({ usage }) }
}

const USAGE = {
  startDate: 1770623326000,
  endDate: 1772956800000,
  standard: { userTokens: 10, orgTotalTokensUsed: 4000000, totalAllowance: 20000000 },
  premium: { userTokens: 0, orgTotalTokensUsed: 500000, totalAllowance: 2000000 },
}

function allLogText(ctx) {
  return Object.values(ctx.host.log)
    .flatMap((fn) => fn.mock.calls)
    .map((args) => args.join(" "))
    .join("\n")
}

function thrown(fn) {
  try {
    fn()
  } catch (e) {
    return e
  }
  throw new Error("expected probe to throw")
}

function thrownMessage(fn) {
  return String(thrown(fn))
}

describe("factory API key source", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("uses the stored API key before the local droid login", async () => {
    const ctx = makeCtx()
    writeLocalSession(ctx)
    storeApiKey(ctx, `  ${API_KEY}\n`)
    ctx.host.http.request.mockReturnValue(usageResponse(USAGE))

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(ctx.host.providerSecrets.read).toHaveBeenCalledWith("apiKey")
    expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
    const request = ctx.host.http.request.mock.calls[0][0]
    expect(request.method).toBe("GET")
    expect(request.url).toBe(USAGE_URL)
    expect(request.headers.Authorization).toBe(`Bearer ${API_KEY}`)
    expect(result.plan).toBeNull()
    expect(result.lines.map((line) => [line.label, line.used, line.limit])).toEqual([
      ["Standard", 4000000, 20000000],
      ["Premium", 500000, 2000000],
    ])
    expect(result.lines[0].resetsAt).toBe(new Date(USAGE.endDate).toISOString())
    expect(result.lines[0].periodDurationMs).toBe(USAGE.endDate - USAGE.startDate)
  })

  it("does not read local droid auth while an API key is stored", async () => {
    const ctx = makeCtx()
    storeApiKey(ctx, API_KEY)
    ctx.host.http.request.mockReturnValue(usageResponse(USAGE))
    ctx.host.keychain.readGenericPassword.mockImplementation(() => {
      throw new Error("keychain must not be read")
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.keychain.readGenericPassword).not.toHaveBeenCalled()
  })

  it("uses the local droid login when no API key is stored", async () => {
    const ctx = makeCtx()
    writeLocalSession(ctx)
    missingSecret(ctx)
    ctx.host.http.request.mockReturnValue(usageResponse(USAGE))

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const request = ctx.host.http.request.mock.calls[0][0]
    expect(request.headers.Authorization).not.toContain(API_KEY)
    expect(request.headers.Authorization).toMatch(/^Bearer eyJ/)
    expect(result.lines[0].label).toBe("Standard")
  })

  it("names both sources when neither an API key nor a local login exists", async () => {
    const ctx = makeCtx()
    missingSecret(ctx)

    const plugin = await loadPlugin()
    const message = thrownMessage(() => plugin.probe(ctx))
    expect(message).toContain("Not logged in")
    expect(message).toContain("Factory API key")
    expect(message).toContain("droid")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it.each([
    ["provider secret store read failed: access denied", "credentialUnreadable"],
    ["credential read failed: invalid data", "credentialUnreadable"],
    ["credential store unavailable: no backend", "credentialUnavailable"],
  ])(
    "surfaces a vault failure (%s) as %s instead of falling back to the local login",
    async (hostError, category) => {
      const ctx = makeCtx()
      writeLocalSession(ctx)
      ctx.host.providerSecrets.read.mockImplementation(() => {
        throw new Error(hostError)
      })

      const plugin = await loadPlugin()
      const error = thrown(() => plugin.probe(ctx))
      expect(error.message).toContain("Could not read the stored Factory API key")
      expect(error.message).toContain(hostError)
      expect(error.category).toBe(category)
      expect(ctx.host.http.request).not.toHaveBeenCalled()
    }
  )

  it("rejects a stored key with inner whitespace before sending a request", async () => {
    const ctx = makeCtx()
    storeApiKey(ctx, "fk-abc\r\nX-Injected: 1")

    const plugin = await loadPlugin()
    const error = thrown(() => plugin.probe(ctx))
    expect(error.message).toContain("Stored Factory API key is malformed")
    expect(error.category).toBe("credentialInvalid")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("maps 401 to an invalid credential without refresh or session fallback", async () => {
    const ctx = makeCtx()
    writeLocalSession(ctx)
    storeApiKey(ctx, API_KEY)
    ctx.host.http.request.mockReturnValue({ status: 401, headers: {}, bodyText: "{}" })

    const plugin = await loadPlugin()
    const error = thrown(() => plugin.probe(ctx))
    expect(error.message).toContain("Factory API key was rejected (HTTP 401)")
    expect(error.category).toBe("credentialInvalid")
    expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
    expect(ctx.host.fs.writeText).toHaveBeenCalledTimes(1) // only the test session setup
  })

  it("maps 403 to an invalid credential without access to subscription usage", async () => {
    const ctx = makeCtx()
    storeApiKey(ctx, API_KEY)
    ctx.host.http.request.mockReturnValue({
      status: 403,
      headers: {},
      bodyText: JSON.stringify({ detail: "forbidden" }),
    })

    const plugin = await loadPlugin()
    const error = thrown(() => plugin.probe(ctx))
    expect(error.message).toContain("cannot read subscription usage (HTTP 403)")
    expect(error.category).toBe("credentialInvalid")
    expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
  })

  it("keeps a network failure out of the credential categories and masks the key in its log", async () => {
    const ctx = makeCtx()
    storeApiKey(ctx, API_KEY)
    ctx.host.http.request.mockImplementation(() => {
      throw new Error(`connect failed for Bearer ${API_KEY}`)
    })

    const plugin = await loadPlugin()
    const error = thrown(() => plugin.probe(ctx))
    expect(String(error)).toContain("Usage request failed. Check your connection.")
    expect(error.category).toBeUndefined()
    expect(allLogText(ctx)).toContain("connect failed for Bearer [REDACTED]")
    expect(allLogText(ctx)).not.toContain(API_KEY)
  })

  it("returns to the local droid login after the key is removed", async () => {
    const ctx = makeCtx()
    writeLocalSession(ctx)
    storeApiKey(ctx, API_KEY)
    ctx.host.http.request.mockReturnValue(usageResponse(USAGE))
    const plugin = await loadPlugin()

    plugin.probe(ctx)
    expect(ctx.host.http.request.mock.calls[0][0].headers.Authorization).toBe(`Bearer ${API_KEY}`)

    missingSecret(ctx) // Settings > Clear secret
    plugin.probe(ctx)
    expect(ctx.host.http.request.mock.calls[1][0].headers.Authorization).toMatch(/^Bearer eyJ/)
  })

  it.each([
    ["API key", (ctx) => storeApiKey(ctx, API_KEY)],
    ["local login", (ctx) => (writeLocalSession(ctx), missingSecret(ctx))],
  ])("maps 429 to a rate limit for the %s source", async (_name, setup) => {
    const ctx = makeCtx()
    setup(ctx)
    ctx.host.http.request.mockReturnValue({ status: 429, headers: {}, bodyText: "{}" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Factory rate limit reached (HTTP 429)")
  })

  it("maps server errors and network failures to visible errors", async () => {
    const ctx = makeCtx()
    storeApiKey(ctx, API_KEY)
    ctx.host.http.request.mockReturnValueOnce({ status: 503, headers: {}, bodyText: "" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage request failed (HTTP 503)")

    ctx.host.http.request.mockImplementationOnce(() => {
      throw new Error("dns failure")
    })
    expect(() => plugin.probe(ctx)).toThrow("Usage request failed. Check your connection.")
  })

  it("rejects malformed JSON and a missing usage object", async () => {
    const ctx = makeCtx()
    storeApiKey(ctx, API_KEY)
    ctx.host.http.request.mockReturnValueOnce({ status: 200, headers: {}, bodyText: "<html>" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage response invalid")

    ctx.host.http.request.mockReturnValueOnce({
      status: 200,
      headers: {},
      bodyText: JSON.stringify({ usage: "unavailable" }),
    })
    expect(() => plugin.probe(ctx)).toThrow("Usage response missing data")
  })

  it.each([
    ["missing", undefined],
    ["non-numeric", "4000000"],
    ["negative", -1],
  ])("does not invent zero usage when orgTotalTokensUsed is %s", async (_name, used) => {
    const ctx = makeCtx()
    storeApiKey(ctx, API_KEY)
    ctx.host.http.request.mockReturnValue(
      usageResponse({
        ...USAGE,
        standard: { orgTotalTokensUsed: used, totalAllowance: 20000000 },
      })
    )

    const plugin = await loadPlugin()
    const error = thrown(() => plugin.probe(ctx))
    expect(error.message).toContain("Usage response missing token counts")
    expect(error.category).toBe("providerResponse")
  })

  it.each([
    ["an array body", "[]"],
    ["a string body", JSON.stringify("ok")],
    ["an array usage", JSON.stringify({ usage: [] })],
    ["a string usage", JSON.stringify({ usage: "unavailable" })],
    ["a string bucket", JSON.stringify({ usage: { ...USAGE, standard: "n/a" } })],
    ["an array bucket", JSON.stringify({ usage: { ...USAGE, premium: [] } })],
    [
      "a string allowance",
      JSON.stringify({
        usage: { ...USAGE, standard: { orgTotalTokensUsed: 1, totalAllowance: "20000" } },
      }),
    ],
    [
      "a negative allowance",
      JSON.stringify({
        usage: { ...USAGE, standard: { orgTotalTokensUsed: 1, totalAllowance: -5 } },
      }),
    ],
    [
      "a bucket without an allowance",
      JSON.stringify({ usage: { ...USAGE, premium: { orgTotalTokensUsed: 1 } } }),
    ],
  ])("rejects %s instead of showing No usage data", async (_name, bodyText) => {
    const ctx = makeCtx()
    storeApiKey(ctx, API_KEY)
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText })

    const plugin = await loadPlugin()
    const error = thrown(() => plugin.probe(ctx))
    expect(error.message).toMatch(/^Usage response (invalid|missing)/)
    expect(error.category).toBe("providerResponse")
  })

  it("keeps an explicit zero allowance as a bucket without quota", async () => {
    const ctx = makeCtx()
    storeApiKey(ctx, API_KEY)
    ctx.host.http.request.mockReturnValue(
      usageResponse({ ...USAGE, premium: { orgTotalTokensUsed: 0, totalAllowance: 0 } })
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.map((line) => line.label)).toEqual(["Standard"])
  })

  it("shows no quota when the key's account returns no allowances", async () => {
    const ctx = makeCtx()
    storeApiKey(ctx, API_KEY)
    ctx.host.http.request.mockReturnValue(
      usageResponse({ startDate: USAGE.startDate, endDate: USAGE.endDate })
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBeNull()
    expect(result.lines).toEqual([
      { type: "badge", label: "Status", text: "No usage data", color: "#a3a3a3" },
    ])
  })

  it("never writes the API key to logs or error messages", async () => {
    const ctx = makeCtx()
    storeApiKey(ctx, API_KEY)
    const plugin = await loadPlugin()

    for (const status of [200, 401, 403, 429, 500]) {
      ctx.host.http.request.mockReturnValueOnce(usageResponse(USAGE, status))
      try {
        plugin.probe(ctx)
      } catch (e) {
        expect(String(e)).not.toContain(API_KEY)
      }
    }

    expect(allLogText(ctx)).not.toContain(API_KEY)
  })
})
