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
const usageCalls = (ctx) =>
  ctx.host.http.request.mock.calls.filter(([request]) => request.url.includes("/api/oauth/usage"))

function defaultAccountCtx() {
  const ctx = makeCtx()
  ctx.host.keychain.readGenericPassword.mockReturnValue(
    JSON.stringify({ claudeAiOauth: { accessToken: "token", expiresAt: START + 24 * 60 * MINUTE } })
  )
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

it("increases the wait for repeated 429s up to a bound", () => {
  const ctx = defaultAccountCtx()
  for (const minutes of [5, 10, 20, 30, 30]) expectWait(ctx, minutes * MINUTE)
  expect(usageCalls(ctx)).toHaveLength(5)
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
  expect(usageCalls(ctx)).toHaveLength(2)
  vi.advanceTimersByTime(10 * MINUTE)
  expectWait(ctx, 20 * MINUTE)
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

it("writes the shared hold atomically", () => {
  const ctx = defaultAccountCtx()
  expect(() => probe(ctx)).toThrow("HTTP 429")
  expect(ctx.host.fs.writeTextAtomic).toHaveBeenCalledWith(
    ctx.app.sharedPluginDataDir + "/rate-limit-default.json",
    expect.any(String)
  )
  expect(ctx.host.fs.writeText).not.toHaveBeenCalled()
})
