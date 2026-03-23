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

function payload(overrides) {
  return {
    data: {
      user: {
        __typename: "UserOutput",
        user: {
          requestLimitInfo: {
            isUnlimited: false,
            nextRefreshTime: "2026-03-31T00:00:00.000Z",
            requestLimit: 500,
            requestsUsedSinceLastRefresh: 125,
            ...overrides,
          },
        },
      },
    },
  }
}

describe("warp plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("throws when no token is configured", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(
      "Warp token missing. Save it in Setup or set WARP_API_KEY."
    )
  })

  it("prefers the stored provider token over env", async () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read.mockImplementation((key) => (key === "token" ? "secret-token" : null))
    setEnv(ctx, { WARP_API_KEY: "env-token" })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: JSON.stringify(payload()) })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    const request = ctx.host.http.request.mock.calls[0][0]
    expect(request.headers.Authorization).toBe("Bearer secret-token")
    expect(request.headers["x-warp-client-id"]).toBe("warp-app")
    expect(request.headers["User-Agent"]).toBe("Warp/1.0")
  })

  it("falls back to WARP_TOKEN when WARP_API_KEY is missing", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { WARP_TOKEN: "env-token" })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: JSON.stringify(payload()) })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Plan")?.text).toBe("Metered")
    expect(ctx.host.http.request.mock.calls[0][0].headers.Authorization).toBe("Bearer env-token")
  })

  it("posts the expected GraphQL operation", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { WARP_API_KEY: "env-token" })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: JSON.stringify(payload()) })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    const request = ctx.host.http.request.mock.calls[0][0]
    const body = JSON.parse(request.bodyText)
    expect(request.method).toBe("POST")
    expect(request.url).toBe("https://app.warp.dev/graphql/v2?op=GetRequestLimitInfo")
    expect(body.operationName).toBe("GetRequestLimitInfo")
    expect(body.query).toContain("requestLimitInfo")
  })

  it("renders metered request usage with reset time", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { WARP_API_KEY: "env-token" })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: JSON.stringify(payload()) })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Requests")).toEqual({
      type: "progress",
      label: "Requests",
      used: 125,
      limit: 500,
      format: { kind: "count", suffix: "credits" },
      resetsAt: "2026-03-31T00:00:00.000Z",
    })
    expect(result.lines.find((line) => line.label === "Plan")).toEqual({
      type: "badge",
      label: "Plan",
      text: "Metered",
    })
  })

  it("renders unlimited accounts with the unlimited badge", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { WARP_API_KEY: "env-token" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify(payload({
        isUnlimited: true,
        requestLimit: null,
        requestsUsedSinceLastRefresh: null,
        nextRefreshTime: null,
      })),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Requests")).toEqual({
      type: "progress",
      label: "Requests",
      used: 0,
      limit: 1,
      format: { kind: "count", suffix: "credits" },
    })
    expect(result.lines.find((line) => line.label === "Plan")?.text).toBe("Unlimited")
  })

  it("throws a precise auth error on 401", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { WARP_API_KEY: "env-token" })
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Warp token invalid. Check Setup or WARP_API_KEY.")
  })

  it("throws on non-auth HTTP errors", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { WARP_API_KEY: "env-token" })
    ctx.host.http.request.mockReturnValue({ status: 500, bodyText: "" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Warp request failed (HTTP 500). Try again later.")
  })

  it("throws on GraphQL errors", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { WARP_API_KEY: "env-token" })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ errors: [{ message: "Rate exceeded." }] }),
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Warp API error: Rate exceeded.")
  })

  it("throws on invalid response payloads", async () => {
    const ctx = makeCtx()
    setEnv(ctx, { WARP_API_KEY: "env-token" })
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: JSON.stringify({ data: {} }) })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Warp response invalid. Try again later.")
  })
})
