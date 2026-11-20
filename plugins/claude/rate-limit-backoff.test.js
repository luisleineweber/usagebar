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
const calls = (ctx, part) =>
  ctx.host.http.request.mock.calls.filter(([request]) => request.url.includes(part))
const usageHoldPath = (ctx) => ctx.app.sharedPluginDataDir + "/rate-limit-default.json"

function oauth(token = "token", expiresAt = START + 24 * 60 * MINUTE) {
  return JSON.stringify({ claudeAiOauth: { accessToken: token, refreshToken: "refresh", expiresAt } })
}

function defaultAccountCtx() {
  const ctx = makeCtx()
  ctx.host.keychain.readGenericPassword.mockReturnValue(oauth())
  ctx.host.http.request.mockReturnValue({ status: 429, bodyText: "" })
  return ctx
}

// A second UsageBar build (installed and dev) uses its own app data dir on the same machine.
function otherAppInstance(ctx) {
  const other = defaultAccountCtx()
  other.host.fs = ctx.host.fs
  other.app = {
    ...ctx.app,
    appDataDir: "/tmp/openusage-other",
    pluginDataDir: "/tmp/openusage-other/plugin",
  }
  return other
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

it("keeps a separate, shared, increasing refresh hold", async () => {
  const ctx = defaultAccountCtx()
  ctx.host.keychain.readGenericPassword.mockReturnValue(oauth("expired", 1))
  expectWait(ctx, 5 * MINUTE)
  expectWait(ctx, 10 * MINUTE)
  expect(calls(ctx, "/v1/oauth/token")).toHaveLength(2)
  expect(calls(ctx, "/api/oauth/usage")).toHaveLength(0)
  expect(ctx.host.fs.exists(ctx.app.sharedPluginDataDir + "/rate-limit-refresh-default.json")).toBe(
    true
  )
  expect(ctx.host.fs.exists(usageHoldPath(ctx))).toBe(false)

  expect(() => probe(ctx)).toThrow(after(20 * MINUTE))
  const other = otherAppInstance(ctx)
  other.host.keychain.readGenericPassword.mockReturnValue(oauth("expired", 1))
  vi.resetModules()
  await import("./plugin.js")
  expect(() => probe(other)).toThrow(after(20 * MINUTE))
  expect(other.host.http.request).not.toHaveBeenCalled()
})

it("keeps web holds increasing and inside their own app data dir", () => {
  const ctx = makeCtx()
  ctx.host.providerSecrets.read.mockReturnValue("sessionKey=sk-ant-web-session")
  ctx.host.http.request.mockReturnValue({ status: 429, bodyText: "" })
  expectWait(ctx, 5 * MINUTE)
  expect(() => probe(ctx)).toThrow(after(10 * MINUTE))
  expect(ctx.host.fs.exists(ctx.app.pluginDataDir + "/rate-limit-web-default.json")).toBe(true)

  const other = otherAppInstance(ctx)
  other.host.keychain.readGenericPassword.mockReturnValue(null)
  other.host.providerSecrets.read = ctx.host.providerSecrets.read
  other.host.http.request.mockReturnValue({ status: 500, bodyText: "" })
  expect(() => probe(other)).toThrow("HTTP 500")
})

it("shares the default account hold with another app instance at startup", async () => {
  const ctx = defaultAccountCtx()
  expect(() => probe(ctx)).toThrow(after(5 * MINUTE))
  const other = otherAppInstance(ctx)
  vi.resetModules()
  await import("./plugin.js")

  expect(() => probe(other)).toThrow(after(5 * MINUTE))
  expect(() => probe(other)).toThrow(after(5 * MINUTE))
  expect(other.host.http.request).not.toHaveBeenCalled()
})

it("keeps managed profile holds inside their own app data dir", () => {
  const ctx = defaultAccountCtx()
  ctx.instanceRef = { providerId: "claude", instanceId: "work" }
  ctx.host.providerSecrets.read.mockReturnValue(
    JSON.stringify({ claudeAiOauth: { accessToken: "managed-token" } })
  )
  expect(() => probe(ctx)).toThrow("HTTP 429")
  const other = otherAppInstance(ctx)
  other.instanceRef = ctx.instanceRef
  other.host.providerSecrets.read = ctx.host.providerSecrets.read
  other.host.http.request.mockReturnValue({ status: 200, bodyText: "{}" })

  expect(() => probe(other)).not.toThrow()
  const defaultAccount = otherAppInstance(ctx)
  defaultAccount.host.http.request.mockReturnValue({ status: 200, bodyText: "{}" })
  expect(() => probe(defaultAccount)).not.toThrow()
})

// No credential record carries a verified account identity, and usage holds must survive token
// rotation and credential replacement. A login switch therefore keeps the hold, but only for
// the window fixed when the hold was recorded.
it("keeps the default hold across a login switch only until its fixed end", () => {
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

it("does not let a late success clear a hold another instance recorded", () => {
  const ctx = defaultAccountCtx()
  expectWait(ctx, 5 * MINUTE)
  const other = otherAppInstance(ctx)
  ctx.host.http.request.mockImplementationOnce(() => {
    expect(() => probe(other)).toThrow(after(10 * MINUTE))
    return { status: 200, bodyText: "{}" }
  })

  expect(() => probe(ctx)).not.toThrow()
  expect(() => probe(ctx)).toThrow(after(10 * MINUTE))
  expect(calls(ctx, "/api/oauth/usage")).toHaveLength(2)
  vi.advanceTimersByTime(10 * MINUTE)
  expectWait(ctx, 20 * MINUTE)
})

it("does not let a success clear a hold written between its read and its write", () => {
  const ctx = defaultAccountCtx()
  expectWait(ctx, 5 * MINUTE)
  const other = otherAppInstance(ctx)
  ctx.host.http.request.mockReturnValueOnce({ status: 200, bodyText: "{}" })
  const swap = ctx.host.fs.compareAndSwapText.getMockImplementation()
  ctx.host.fs.compareAndSwapText.mockImplementationOnce((...args) => {
    expect(() => probe(other)).toThrow(after(10 * MINUTE))
    return swap(...args)
  })

  expect(() => probe(ctx)).not.toThrow()
  expect(() => probe(ctx)).toThrow(after(10 * MINUTE))
})

it("does not let a stale 429 decision overwrite a newer longer hold", () => {
  const ctx = defaultAccountCtx()
  const other = otherAppInstance(ctx)
  other.host.http.request.mockReturnValue({ status: 429, headers: { "Retry-After": "2400" } })
  const swap = ctx.host.fs.compareAndSwapText.getMockImplementation()
  ctx.host.fs.compareAndSwapText.mockImplementationOnce((...args) => {
    expect(() => probe(other)).toThrow(after(40 * MINUTE))
    return swap(...args)
  })

  expect(() => probe(ctx)).toThrow(after(40 * MINUTE))
  vi.advanceTimersByTime(40 * MINUTE)
  expectWait(ctx, 10 * MINUTE)
})

it("does not escalate a 429 that arrives during an active hold", () => {
  const ctx = defaultAccountCtx()
  const other = otherAppInstance(ctx)
  ctx.host.http.request.mockImplementationOnce(() => {
    expect(() => probe(other)).toThrow(after(5 * MINUTE))
    return { status: 429, bodyText: "" }
  })

  expectWait(ctx, 5 * MINUTE)
  expectWait(ctx, 10 * MINUTE)
})

it("extends an active hold when a concurrent 429 sends a longer Retry-After", () => {
  const ctx = defaultAccountCtx()
  const other = otherAppInstance(ctx)
  ctx.host.http.request.mockImplementationOnce(() => {
    expect(() => probe(other)).toThrow(after(5 * MINUTE))
    return { status: 429, headers: { "Retry-After": "900" } }
  })

  expectWait(ctx, 15 * MINUTE)
  expectWait(ctx, 10 * MINUTE)
})

it.each([
  ["invalid JSON", "{"],
  ["null", "null"],
  ["an array", "[]"],
  ["an infinite retryAt", '{"retryAt":1e999,"streak":1,"recordedAt":' + START + "}"],
  ["a retryAt past the window", JSON.stringify({ retryAt: START + 61 * MINUTE, streak: 1, recordedAt: START })],
  ["a negative streak", JSON.stringify({ retryAt: START + MINUTE, streak: -1, recordedAt: START })],
  ["a record without recordedAt", JSON.stringify({ retryAt: START + MINUTE })],
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

it("shows an error when the hold record keeps changing", () => {
  const ctx = defaultAccountCtx()
  ctx.host.fs.compareAndSwapText.mockReturnValue(false)

  expect(() => probe(ctx)).toThrow("Claude rate-limit state is busy. Try again.")
  expect(ctx.host.log.error).toHaveBeenCalled()
})

it("does not shorten a hold another build writes after this build samples the clock", () => {
  const ctx = defaultAccountCtx()
  const other = otherAppInstance(ctx)
  const exists = ctx.host.fs.exists
  let interleaved = false
  ctx.host.fs.exists = (path) => {
    if (!interleaved && path === usageHoldPath(ctx)) {
      interleaved = true
      vi.advanceTimersByTime(MINUTE)
      expect(() => probe(other)).toThrow(after(5 * MINUTE))
    }
    return exists(path)
  }

  // The other build recorded its hold one minute later, so it ends six minutes after START.
  expect(() => probe(ctx)).toThrow(
    "Try again after " + new Date(START + 6 * MINUTE).toISOString()
  )
  expect(interleaved).toBe(true)
  expect(ctx.host.http.request).not.toHaveBeenCalled()
})

it("keeps a hold recorded during a request even when the clock moved back", () => {
  const ctx = defaultAccountCtx()
  expectWait(ctx, 5 * MINUTE)
  vi.advanceTimersByTime(20 * MINUTE)
  const other = otherAppInstance(ctx)
  ctx.host.http.request.mockImplementationOnce(() => {
    vi.setSystemTime(new Date(Date.now() - 10 * MINUTE))
    expect(() => probe(other)).toThrow(after(10 * MINUTE))
    return { status: 200, bodyText: "{}" }
  })

  expect(() => probe(ctx)).not.toThrow()
  expect(() => probe(ctx)).toThrow(after(10 * MINUTE))
})

it("keeps the web count when only the overage request is rate limited", () => {
  const ctx = makeCtx()
  ctx.host.providerSecrets.read.mockReturnValue("sessionKey=sk-ant-web-session")
  ctx.host.http.request.mockImplementation(({ url }) => {
    if (url.endsWith("/overage_spend_limit")) return { status: 429, bodyText: "" }
    if (url.endsWith("/organizations")) {
      return { status: 200, bodyText: JSON.stringify([{ uuid: "org-1", capabilities: ["chat"] }]) }
    }
    return { status: 200, bodyText: JSON.stringify({ five_hour: { utilization: 42 } }) }
  })

  expectWait(ctx, 5 * MINUTE)
  expectWait(ctx, 10 * MINUTE)
})
