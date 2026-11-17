import { afterEach, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

afterEach(() => vi.useRealTimers())

it("keeps retry deadlines separate for managed profiles", async () => {
  const ctx = makeCtx()
  ctx.host.providerSecrets.read.mockReturnValue(
    JSON.stringify({ claudeAiOauth: { accessToken: "managed-token" } })
  )
  ctx.instanceRef = { providerId: "claude", instanceId: "first" }
  ctx.host.http.request.mockReturnValue({ status: 429, bodyText: "" })
  vi.resetModules()
  await import("./plugin.js")
  expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("HTTP 429")
  ctx.instanceRef = { providerId: "claude", instanceId: "second" }
  ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "{}" })
  expect(() => globalThis.__openusage_plugin.probe(ctx)).not.toThrow()
  ctx.instanceRef = { providerId: "claude", instanceId: "first" }
  expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("HTTP 429")
  expect(ctx.host.http.request).toHaveBeenCalledTimes(2)
})

it("recovers after the retry deadline and accepts later successful probes", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-03T13:15:00Z"))
  const ctx = makeCtx()
  ctx.host.keychain.readGenericPassword.mockReturnValue(
    JSON.stringify({
      claudeAiOauth: { accessToken: "token" },
    })
  )
  ctx.host.http.request.mockReturnValue({ status: 429, bodyText: "" })
  vi.resetModules()
  await import("./plugin.js")
  expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("HTTP 429")
  vi.advanceTimersByTime(300_000)
  ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "{}" })
  vi.resetModules()
  await import("./plugin.js")
  expect(() => globalThis.__openusage_plugin.probe(ctx)).not.toThrow()
  expect(() => globalThis.__openusage_plugin.probe(ctx)).not.toThrow()
  expect(ctx.host.http.request).toHaveBeenCalledTimes(3)
})

it("does not refresh twice when usage rejects a proactively refreshed token", async () => {
  const ctx = makeCtx()
  ctx.host.keychain.readGenericPassword.mockReturnValue(
    JSON.stringify({
      claudeAiOauth: { accessToken: "test", refreshToken: "refresh", expiresAt: 1 },
    })
  )
  ctx.host.http.request.mockImplementation(({ url }) =>
    url.includes("/v1/oauth/token")
      ? { status: 200, bodyText: JSON.stringify({ access_token: "new", expires_in: 3600 }) }
      : { status: 401, bodyText: "{}" }
  )
  await import("./plugin.js")
  expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("Token expired")
  expect(
    ctx.host.http.request.mock.calls.filter(([request]) => request.url.includes("/v1/oauth/token"))
  ).toHaveLength(1)
  expect(
    ctx.host.http.request.mock.calls.filter(([request]) => request.url.includes("/api/oauth/usage"))
  ).toHaveLength(1)
})

it.each([
  ["usage", "600", 600_000],
  ["usage", "Tue, 03 Nov 2026 13:25:00 GMT", 600_000],
  ["refresh", "600", 600_000],
  ["usage", "invalid", 300_000],
  ["usage", undefined, 300_000],
])("keeps %s Retry-After %s across fresh runtimes", async (endpoint, retryAfter, delay) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-03T13:15:00Z"))
  const ctx = makeCtx()
  ctx.host.keychain.readGenericPassword.mockReturnValue(
    JSON.stringify({
      claudeAiOauth: {
        accessToken: "test",
        refreshToken: "refresh",
        expiresAt: Date.now() + (endpoint === "refresh" ? -1 : 3600000),
      },
    })
  )
  ctx.host.http.request.mockReturnValue({
    status: 429,
    headers: { "Retry-After": retryAfter },
    bodyText: "{}",
  })
  await import("./plugin.js")
  expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("429")
  vi.resetModules()
  await import("./plugin.js")
  vi.advanceTimersByTime(5_000)
  expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("429")
  expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
  expect(ctx.host.http.request.mock.calls[0][0].url).toContain(
    endpoint === "refresh" ? "/v1/oauth/token" : "/api/oauth/usage"
  )
  vi.advanceTimersByTime(delay - 5000)
  expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("429")
  expect(ctx.host.http.request).toHaveBeenCalledTimes(2)
})

// Synthetic adversarial records. These are not evidence of a Claude credential schema.
it.each([
  undefined,
  { organizationUuid: "shared-org", accountUuid: "oauth-user" },
  { organizationUuid: "other-org", accountUuid: "oauth-user" },
])("keeps OAuth 429 without reading shared cookies for metadata %j", async (oauthAccount) => {
  const ctx = makeCtx()
  ctx.host.keychain.readGenericPassword.mockReturnValue(
    JSON.stringify({
      claudeAiOauth: { accessToken: "token" },
      oauthAccount,
    })
  )
  ctx.host.providerSecrets.read.mockReturnValue("sessionKey=sk-ant-other-user")
  ctx.host.http.request.mockImplementation(({ url }) => {
    if (url.includes("/api/oauth/usage")) return { status: 429, bodyText: "" }
    if (url.endsWith("/organizations"))
      return {
        status: 200,
        bodyText: JSON.stringify([{ uuid: "shared-org", capabilities: ["chat"] }]),
      }
    return { status: 200, bodyText: JSON.stringify({ five_hour: { utilization: 42 } }) }
  })
  vi.resetModules()
  await import("./plugin.js")
  expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("HTTP 429")
  vi.resetModules()
  await import("./plugin.js")
  expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("HTTP 429")
  expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
  expect(ctx.host.providerSecrets.read).not.toHaveBeenCalledWith("cookieHeader")
})

it("keeps managed OAuth 429 without reading shared cookies", async () => {
  const ctx = makeCtx()
  ctx.instanceRef = { providerId: "claude", instanceId: "work" }
  ctx.host.providerSecrets.read.mockImplementation((key) =>
    key === "account:work:authJson"
      ? JSON.stringify({ claudeAiOauth: { accessToken: "managed-token" } })
      : "sessionKey=sk-ant-other-user"
  )
  ctx.host.http.request.mockReturnValue({ status: 429, bodyText: "" })
  vi.resetModules()
  await import("./plugin.js")
  expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("HTTP 429")
  expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("HTTP 429")
  expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
  expect(ctx.host.providerSecrets.read).not.toHaveBeenCalledWith("cookieHeader")
})

it("honors web Retry-After without OAuth, then recovers", async () => {
  vi.useFakeTimers()
  const ctx = makeCtx()
  ctx.host.providerSecrets.read.mockReturnValue("sessionKey=sk-ant-web-session")
  ctx.host.http.request.mockReturnValue({
    status: 429,
    headers: { "Retry-After": "600" },
    bodyText: "",
  })
  vi.resetModules()
  await import("./plugin.js")
  expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("HTTP 429")
  vi.advanceTimersByTime(599_999)
  vi.resetModules()
  await import("./plugin.js")
  expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("HTTP 429")
  expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(1)
  expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("HTTP 429")
  expect(ctx.host.http.request).toHaveBeenCalledTimes(2)
})

it.each([500, 429])("surfaces required web HTTP %s without OAuth", async (status) => {
  const ctx = makeCtx()
  ctx.host.providerSecrets.read.mockReturnValue("sessionKey=sk-ant-web-session")
  ctx.host.http.request.mockReturnValue({ status, bodyText: "" })
  vi.resetModules()
  await import("./plugin.js")
  expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("HTTP " + status)
})

it.each([
  ["usage", []],
  ["organizations", { uuid: "org-1" }],
])("rejects invalid required web %s response shape", async (description, body) => {
  const ctx = makeCtx()
  ctx.host.providerSecrets.read.mockReturnValue("sessionKey=sk-ant-web-session")
  ctx.host.http.request.mockImplementation(({ url }) => ({
    status: 200,
    bodyText: JSON.stringify(
      url.endsWith("/" + description) ? body : [{ uuid: "org-1", capabilities: ["chat"] }]
    ),
  }))
  vi.resetModules()
  await import("./plugin.js")
  expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow(
    "Claude web " + description + " response invalid."
  )
})

it.each([
  ["usage", []],
  ["organizations", { uuid: "org-1" }],
])("keeps OAuth 429 during backoff with invalid web %s configured", async (description, body) => {
  const ctx = makeCtx()
  ctx.host.keychain.readGenericPassword.mockReturnValue(
    JSON.stringify({
      claudeAiOauth: { accessToken: "token" },
    })
  )
  ctx.host.providerSecrets.read.mockReturnValue("sessionKey=sk-ant-web-session")
  ctx.host.http.request.mockImplementation(({ url }) =>
    url.includes("/api/oauth/usage")
      ? { status: 429, bodyText: "" }
      : {
          status: 200,
          bodyText: JSON.stringify(
            url.endsWith("/" + description) ? body : [{ uuid: "org-1", capabilities: ["chat"] }]
          ),
        }
  )
  vi.resetModules()
  await import("./plugin.js")
  expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("HTTP 429")
  vi.resetModules()
  await import("./plugin.js")
  expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("HTTP 429")
  expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
  expect(ctx.host.providerSecrets.read).not.toHaveBeenCalledWith("cookieHeader")
})

it("ignores an array from the optional web overage endpoint", async () => {
  const ctx = makeCtx()
  ctx.host.providerSecrets.read.mockReturnValue("sessionKey=sk-ant-web-session")
  ctx.host.http.request.mockImplementation(({ url }) => ({
    status: 200,
    bodyText: JSON.stringify(
      url.endsWith("/organizations")
        ? [{ uuid: "org-1", capabilities: ["chat"] }]
        : url.endsWith("/usage")
          ? { five_hour: { utilization: 42 } }
          : []
    ),
  }))
  vi.resetModules()
  await import("./plugin.js")
  const result = globalThis.__openusage_plugin.probe(ctx)
  expect(result.lines.find((line) => line.label === "Session")?.used).toBe(42)
  expect(result.lines.some((line) => line.label === "Extra usage")).toBe(false)
})
