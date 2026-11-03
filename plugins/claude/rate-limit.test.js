import { expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

it.each(["120", "Mon, 02 Feb 2026 00:02:00 GMT", undefined, "invalid"])(
  "keeps the Claude retry delay across runtime reloads: %s",
  async (retryAfter) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-02T00:00:00Z"))
    try {
      const ctx = makeCtx()
      ctx.host.keychain.readGenericPassword.mockReturnValue(
        JSON.stringify({ claudeAiOauth: { accessToken: "token" } })
      )
      ctx.host.http.request.mockReturnValue({
        status: 429,
        headers: { "retry-after": retryAfter },
        bodyText: "",
      })
      vi.resetModules()
      await import("./plugin.js")
      expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("HTTP 429")
      vi.resetModules()
      await import("./plugin.js")
      vi.advanceTimersByTime(
        retryAfter === undefined || retryAfter === "invalid" ? 240_000 : 60_000
      )
      expect(() => globalThis.__openusage_plugin.probe(ctx)).toThrow("HTTP 429")
      expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(60_000)
      ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "{}" })
      expect(() => globalThis.__openusage_plugin.probe(ctx)).not.toThrow()
      expect(ctx.host.http.request).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  }
)

it("keeps retry delays separate for managed profiles", async () => {
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
