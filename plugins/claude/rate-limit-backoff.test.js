import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const START = Date.parse("2026-11-03T13:15:00Z")
const MINUTE = 60_000

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(START))
  vi.resetModules()
  await import("./plugin.js")
})
afterEach(() => vi.useRealTimers())

const probe = (ctx) => globalThis.__openusage_plugin.probe(ctx)
const after = (ms) => "Try again after " + new Date(Date.now() + ms).toISOString()
const at = (ms) => "Try again after " + new Date(START + ms).toISOString()
const calls = (ctx, part) =>
  ctx.host.http.request.mock.calls.filter(([request]) => request.url.includes(part))
const usageHoldPath = (ctx) => ctx.app.pluginDataDir + "/rate-limit-default.json"

function oauth(token = "token", expiresAt = START + 24 * 60 * MINUTE) {
  return JSON.stringify({
    claudeAiOauth: { accessToken: token, refreshToken: "refresh", expiresAt },
  })
}

function defaultAccountCtx() {
  const ctx = makeCtx()
  ctx.host.keychain.readGenericPassword.mockReturnValue(oauth())
  ctx.host.http.request.mockReturnValue({ status: 429, bodyText: "" })
  return ctx
}

// A second process of the same build reads and writes the same plugin data dir.
function sameBuildProcess(ctx) {
  const other = defaultAccountCtx()
  other.host.fs = ctx.host.fs
  other.app = ctx.app
  return other
}

function webCtx(overageStatus = 200) {
  const ctx = makeCtx()
  ctx.host.providerSecrets.read.mockReturnValue("sessionKey=sk-ant-web-session")
  ctx.host.http.request.mockImplementation(({ url }) => {
    if (url.endsWith("/overage_spend_limit")) return { status: overageStatus, bodyText: "{}" }
    if (url.endsWith("/organizations")) {
      return { status: 200, bodyText: JSON.stringify([{ uuid: "org-1", capabilities: ["chat"] }]) }
    }
    return { status: 200, bodyText: JSON.stringify({ five_hour: { utilization: 42 } }) }
  })
  return ctx
}

function expectWait(ctx, ms) {
  expect(() => probe(ctx)).toThrow(after(ms))
  vi.advanceTimersByTime(ms)
}

it("increases the usage wait for repeated 429s up to a bound", () => {
  const ctx = defaultAccountCtx()
  for (const minutes of [5, 10, 20, 30, 30]) expectWait(ctx, minutes * MINUTE)
  expect(calls(ctx, "/api/oauth/usage")).toHaveLength(5)
})

it("honors a longer Retry-After and bounds it to one hour", () => {
  const ctx = defaultAccountCtx()
  ctx.host.http.request.mockReturnValue({ status: 429, headers: { "retry-after": "1200" } })
  expectWait(ctx, 20 * MINUTE)
  ctx.host.http.request.mockReturnValue({ status: 429, headers: { "Retry-After": "7200" } })
  expectWait(ctx, 60 * MINUTE)
})

it("resets the wait only after a successful usage response", () => {
  const ctx = defaultAccountCtx()
  expectWait(ctx, 5 * MINUTE)
  expectWait(ctx, 10 * MINUTE)
  ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "{}" })
  expect(() => probe(ctx)).not.toThrow()
  ctx.host.http.request.mockReturnValue({ status: 429, bodyText: "" })
  expectWait(ctx, 5 * MINUTE)
})

it("keeps a separate, increasing refresh hold in the plugin data dir", () => {
  const ctx = defaultAccountCtx()
  ctx.host.keychain.readGenericPassword.mockReturnValue(oauth("expired", 1))
  expectWait(ctx, 5 * MINUTE)
  expectWait(ctx, 10 * MINUTE)
  expect(calls(ctx, "/v1/oauth/token")).toHaveLength(2)
  expect(calls(ctx, "/api/oauth/usage")).toHaveLength(0)
  expect(ctx.host.fs.exists(ctx.app.pluginDataDir + "/rate-limit-refresh-default.json")).toBe(true)
  expect(ctx.host.fs.exists(usageHoldPath(ctx))).toBe(false)
})

it("increases the web wait for repeated 429s", () => {
  const ctx = makeCtx()
  ctx.host.providerSecrets.read.mockReturnValue("sessionKey=sk-ant-web-session")
  ctx.host.http.request.mockReturnValue({ status: 429, bodyText: "" })
  expectWait(ctx, 5 * MINUTE)
  expect(() => probe(ctx)).toThrow(after(10 * MINUTE))
  expect(ctx.host.fs.exists(ctx.app.pluginDataDir + "/rate-limit-web-default.json")).toBe(true)
})

it.each([
  ["a rate-limited", 429],
  ["a failed", 500],
])("keeps the web count after %s overage request", (_, status) => {
  const ctx = webCtx()
  ctx.host.http.request.mockReturnValueOnce({ status: 429, bodyText: "" })
  expectWait(ctx, 5 * MINUTE)
  const web = ctx.host.http.request.getMockImplementation()
  ctx.host.http.request.mockImplementation((request) =>
    request.url.endsWith("/overage_spend_limit") ? { status, bodyText: "" } : web(request)
  )
  if (status === 429) expectWait(ctx, 10 * MINUTE)
  else expect(() => probe(ctx)).not.toThrow()
  ctx.host.http.request.mockReturnValue({ status: 429, bodyText: "" })
  expect(() => probe(ctx)).toThrow(after((status === 429 ? 20 : 10) * MINUTE))
})

it("resets the web count after a fully successful web probe", () => {
  const ctx = webCtx()
  ctx.host.http.request.mockReturnValueOnce({ status: 429, bodyText: "" })
  expectWait(ctx, 5 * MINUTE)
  expect(() => probe(ctx)).not.toThrow()
  ctx.host.http.request.mockReturnValue({ status: 429, bodyText: "" })
  expect(() => probe(ctx)).toThrow(after(5 * MINUTE))
})

// No credential record carries a verified account identity, and usage holds must survive token
// rotation and credential replacement. A login switch therefore keeps the hold, but only for
// the window fixed when the hold was recorded.
it("keeps the hold across a login switch only until its fixed end", () => {
  const ctx = defaultAccountCtx()
  ctx.host.http.request.mockReturnValue({ status: 429, headers: { "Retry-After": "86400" } })
  expect(() => probe(ctx)).toThrow(after(60 * MINUTE))
  ctx.host.keychain.readGenericPassword.mockReturnValue(oauth("other-login"))
  vi.advanceTimersByTime(59 * MINUTE)
  expect(() => probe(ctx)).toThrow(after(MINUTE))
  vi.advanceTimersByTime(MINUTE)
  ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "{}" })
  expect(() => probe(ctx)).not.toThrow()
  expect(calls(ctx, "/api/oauth/usage")).toHaveLength(2)
})

it("blocks a request when a hold appears after the probe's first check", () => {
  const ctx = defaultAccountCtx()
  expectWait(ctx, 5 * MINUTE)
  const other = sameBuildProcess(ctx)
  ctx.host.keychain.readGenericPassword.mockImplementationOnce(() => {
    expect(() => probe(other)).toThrow(after(10 * MINUTE))
    return oauth()
  })
  ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "{}" })

  expect(() => probe(ctx)).toThrow(after(10 * MINUTE))
  expect(() => probe(ctx)).toThrow(after(10 * MINUTE))
  expect(calls(ctx, "/api/oauth/usage")).toHaveLength(1)
})

it("does not let a late success clear a hold recorded during its request", () => {
  const ctx = defaultAccountCtx()
  expectWait(ctx, 5 * MINUTE)
  vi.advanceTimersByTime(20 * MINUTE)
  const other = sameBuildProcess(ctx)
  ctx.host.http.request.mockImplementationOnce(() => {
    vi.setSystemTime(new Date(Date.now() - 10 * MINUTE))
    expect(() => probe(other)).toThrow(after(10 * MINUTE))
    return { status: 200, bodyText: "{}" }
  })

  expect(() => probe(ctx)).not.toThrow()
  expect(() => probe(ctx)).toThrow(after(10 * MINUTE))
})

it("does not escalate a 429 that arrives during an active hold", () => {
  const ctx = defaultAccountCtx()
  const other = sameBuildProcess(ctx)
  ctx.host.http.request.mockImplementationOnce(() => {
    expect(() => probe(other)).toThrow(after(5 * MINUTE))
    return { status: 429, bodyText: "" }
  })

  expectWait(ctx, 5 * MINUTE)
  expectWait(ctx, 10 * MINUTE)
})

it("extends an active hold when a concurrent 429 sends a longer Retry-After", () => {
  const ctx = defaultAccountCtx()
  const other = sameBuildProcess(ctx)
  ctx.host.http.request.mockImplementationOnce(() => {
    expect(() => probe(other)).toThrow(after(5 * MINUTE))
    return { status: 429, headers: { "Retry-After": "900" } }
  })

  expectWait(ctx, 15 * MINUTE)
  expectWait(ctx, 10 * MINUTE)
})

it("reads a legacy retryAt-only record as one 429", () => {
  const ctx = defaultAccountCtx()
  ctx.host.fs.writeText(usageHoldPath(ctx), JSON.stringify({ retryAt: START + 20 * MINUTE }))

  expect(() => probe(ctx)).toThrow(at(20 * MINUTE))
  expect(ctx.host.http.request).not.toHaveBeenCalled()
  vi.advanceTimersByTime(20 * MINUTE)
  expectWait(ctx, 10 * MINUTE)
})

it("caps a legacy retryAt-only record at one hour", () => {
  const ctx = defaultAccountCtx()
  ctx.host.fs.writeText(usageHoldPath(ctx), JSON.stringify({ retryAt: START + 5 * 60 * MINUTE }))

  expect(() => probe(ctx)).toThrow(at(60 * MINUTE))
  vi.advanceTimersByTime(30 * MINUTE)
  expect(() => probe(ctx)).toThrow(at(60 * MINUTE))
})

it.each([
  ["invalid JSON", "{"],
  ["null", "null"],
  ["an array", "[]"],
  ["an infinite retryAt", '{"retryAt":1e999,"streak":1,"recordedAt":' + START + "}"],
  [
    "a retryAt past the window",
    JSON.stringify({ retryAt: START + 61 * MINUTE, streak: 1, recordedAt: START }),
  ],
  ["a negative streak", JSON.stringify({ retryAt: START + MINUTE, streak: -1, recordedAt: START })],
  ["an infinite legacy retryAt", '{"retryAt":1e999}'],
])("logs and discards a hold record with %s", (_, text) => {
  const ctx = defaultAccountCtx()
  ctx.host.fs.writeText(usageHoldPath(ctx), text)
  ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "{}" })

  expect(() => probe(ctx)).not.toThrow()
  expect(ctx.host.log.warn).toHaveBeenCalledWith("discarding invalid Claude rate-limit record")
  expect(JSON.parse(ctx.host.fs.readText(usageHoldPath(ctx)))).toMatchObject({
    retryAt: 0,
    streak: 0,
  })
})

it("does not extend a hold when the clock moves back", () => {
  const ctx = defaultAccountCtx()
  expect(() => probe(ctx)).toThrow(after(5 * MINUTE))
  vi.setSystemTime(new Date(START - 24 * 60 * MINUTE))

  expect(() => probe(ctx)).toThrow(after(5 * MINUTE))
  vi.advanceTimersByTime(5 * MINUTE)
  ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "{}" })
  expect(() => probe(ctx)).not.toThrow()
})
