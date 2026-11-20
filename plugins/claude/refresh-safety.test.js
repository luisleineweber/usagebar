import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"
import { ownCredentials } from "./test-helpers.js"

const document = (owner) => ({
  usagebarCredentialOwner: owner,
  claudeAiOauth: { accessToken: "old", refreshToken: "refresh", expiresAt: 1 },
  unrelated: { keep: true },
})

async function plugin() {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function usage(ctx) {
  ctx.host.http.request.mockReturnValue({
    status: 200,
    bodyText: JSON.stringify({ five_hour: { utilization: 0 } }),
  })
}

afterEach(() => vi.useRealTimers())

describe("Claude refresh ownership", () => {
  beforeEach(() => {
    vi.resetModules()
    delete globalThis.__openusage_plugin
  })

  it.each(["file", "keychain", "account-file"])(
    "does not rotate or write Claude Code %s credentials",
    async (source) => {
      const ctx = makeCtx()
      const full = JSON.stringify(document("usagebar"))
      if (source === "keychain") ctx.host.keychain.readGenericPassword.mockReturnValue(full)
      else {
        const path = source === "file" ? "~/.claude/.credentials.json" : "~/.claude.json"
        ctx.host.fs.writeText(path, full)
        ctx.host.fs.writeText.mockClear()
      }
      usage(ctx)
      const result = (await plugin()).probe(ctx)
      expect(result.lines.find((line) => line.label === "Session").used).toBe(0)
      expect(
        ctx.host.http.request.mock.calls.every(([req]) => req.url.includes("/api/oauth/usage"))
      ).toBe(true)
      expect(ctx.host.fs.writeText).not.toHaveBeenCalled()
      expect(ctx.host.keychain.writeGenericPassword).not.toHaveBeenCalled()
      expect(ctx.host.providerSecrets.write).not.toHaveBeenCalled()
    }
  )

  it("keeps an imported managed chain owned by Claude Code", async () => {
    const ctx = makeCtx()
    ctx.instanceRef = { providerId: "claude", instanceId: "imported" }
    ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(document(undefined)))
    usage(ctx)
    ;(await plugin()).probe(ctx)
    expect(
      ctx.host.http.request.mock.calls.every(([req]) => req.url.includes("/api/oauth/usage"))
    ).toBe(true)
    expect(ctx.host.providerSecrets.write).not.toHaveBeenCalled()
    expect(ctx.host.fs.readText("~/.claude/.credentials.json")).toBeUndefined()
  })

  it("uses the host transaction for an explicitly owned managed chain", async () => {
    const ctx = makeCtx()
    ctx.instanceRef = { providerId: "claude", instanceId: "owned" }
    ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(document("usagebar")))
    const updated = document("usagebar")
    updated.claudeAiOauth = {
      accessToken: "new",
      refreshToken: "rotated",
      expiresAt: Date.now() + 3600000,
    }
    ctx.host.providerSecrets.refreshClaudeCredentials = vi.fn(() =>
      JSON.stringify({ credentials: JSON.stringify(updated), response: null })
    )
    usage(ctx)
    ;(await plugin()).probe(ctx)
    expect(ctx.host.providerSecrets.refreshClaudeCredentials).toHaveBeenCalledOnce()
    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer new" }) })
    )
    expect(ctx.host.providerSecrets.write).not.toHaveBeenCalled()
  })
  it("reloads a token rotated by Claude Code before retrying usage", async () => {
    const ctx = makeCtx()
    const previous = document(undefined)
    previous.claudeAiOauth.expiresAt = Date.now() + 3600000
    const updated = document(undefined)
    updated.claudeAiOauth.expiresAt = Date.now() + 3600000
    updated.claudeAiOauth.accessToken = "cli-rotated"
    ctx.host.keychain.readGenericPassword
      .mockReturnValueOnce(JSON.stringify(previous))
      .mockReturnValue(JSON.stringify(updated))
    ctx.host.http.request.mockImplementation(({ headers }) => ({
      status: headers.Authorization === "Bearer cli-rotated" ? 200 : 401,
      bodyText: JSON.stringify({ five_hour: { utilization: 0 } }),
    }))
    const result = (await plugin()).probe(ctx)
    expect(result.lines.find((line) => line.label === "Session").used).toBe(0)
    expect(ctx.host.http.request).toHaveBeenCalledTimes(2)
    expect(ctx.host.keychain.writeGenericPassword).not.toHaveBeenCalled()
  })

  it("surfaces host storage failures before usage can use an old token", async () => {
    const ctx = makeCtx()
    ctx.instanceRef = { providerId: "claude", instanceId: "owned" }
    ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(document("usagebar")))
    ctx.host.providerSecrets.refreshClaudeCredentials = () => {
      throw "Could not save refreshed Claude credentials"
    }
    const loaded = await plugin()
    expect(() => loaded.probe(ctx)).toThrow("Could not save refreshed Claude credentials")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })
})

it("asks to re-import an expired managed Claude Code login", async () => {
  vi.resetModules()
  const ctx = makeCtx()
  ctx.instanceRef = { providerId: "claude", instanceId: "imported" }
  ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(document("claude-code")))
  ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "{}" })
  const loaded = await plugin()
  expect(() => loaded.probe(ctx)).toThrow("Re-import this Claude account in Settings")
  expect(ctx.host.keychain.readGenericPassword).not.toHaveBeenCalled()
})

it.each([
  "invalid_grant",
  "synthetic-private-server-text",
  { detail: "synthetic-private-server-text" },
])("does not log server text in refresh errors: %j", async (error) => {
  vi.resetModules()
  const ctx = makeCtx()
  ctx.host.keychain.readGenericPassword.mockReturnValue(JSON.stringify(document("usagebar")))
  ownCredentials(ctx)
  ctx.host.http.request.mockReturnValue({
    status: 400,
    bodyText: JSON.stringify({ error, error_description: "synthetic-private-description" }),
  })
  const loaded = await plugin()
  expect(() => loaded.probe(ctx)).toThrow()
  const messages = JSON.stringify(ctx.host.log.error.mock.calls)
  expect(messages).not.toContain("synthetic-private")
  expect(messages).not.toContain("[object Object]")
})

it("keeps legacy invalid_grant classification while filtering log values", async () => {
  vi.resetModules()
  const ctx = makeCtx()
  ctx.host.keychain.readGenericPassword.mockReturnValue(JSON.stringify(document("usagebar")))
  ownCredentials(ctx)
  ctx.host.http.request.mockReturnValue({
    status: 400,
    bodyText: JSON.stringify({ error_description: "invalid_grant" }),
  })
  const loaded = await plugin()
  expect(() => loaded.probe(ctx)).toThrow("Session expired")
  expect(ctx.host.log.error).toHaveBeenCalledWith("refresh failed: status=400 error=invalid_grant")
})

it.each([1, 120000])(
  "routes native refresh 429 to the refresh hold with token lifetime %s",
  async (lifetime) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-03T13:15:00Z"))
    vi.resetModules()
    const ctx = makeCtx()
    ctx.instanceRef = { providerId: "claude", instanceId: "owned" }
    const full = document("usagebar")
    full.claudeAiOauth.expiresAt = lifetime === 1 ? 1 : Date.now() + lifetime
    ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(full))
    ctx.host.providerSecrets.refreshClaudeCredentials = vi.fn(() =>
      JSON.stringify({
        credentials: null,
        response: { status: 429, headers: { "Retry-After": "600" }, bodyText: "{}" },
      })
    )
    const loaded = await plugin()
    expect(() => loaded.probe(ctx)).toThrow("HTTP 429")
    expect(ctx.host.fs.exists(ctx.app.pluginDataDir + "/rate-limit-owned.json")).toBe(false)
    expect(
      JSON.parse(ctx.host.fs.readText(ctx.app.pluginDataDir + "/rate-limit-refresh-owned.json"))
    ).toEqual({ retryAt: Date.now() + 600000 })
    vi.resetModules()
    vi.advanceTimersByTime(5000)
    usage(ctx)
    const next = await plugin()
    if (lifetime === 1) expect(() => next.probe(ctx)).toThrow("HTTP 429")
    else expect(next.probe(ctx).lines.find((line) => line.label === "Session").used).toBe(0)
    expect(ctx.host.providerSecrets.refreshClaudeCredentials).toHaveBeenCalledOnce()
    expect(ctx.host.http.request).toHaveBeenCalledTimes(lifetime === 1 ? 0 : 1)
    expect(ctx.host.providerSecrets.read).not.toHaveBeenCalledWith("cookieHeader")
  }
)

it.each([
  "Could not save refreshed Claude credentials. Recovery will run before another refresh. Retry the probe.",
  "Refreshed Claude credentials are unsaved. Recovery and main storage both failed. Keep UsageBar open and retry.",
])(
  "keeps the native save error when a refresh hold arrives during the transaction: %s",
  async (message) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-03T13:15:00Z"))
    vi.resetModules()
    const ctx = makeCtx()
    ctx.instanceRef = { providerId: "claude", instanceId: "owned" }
    ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(document("usagebar")))
    ctx.host.providerSecrets.refreshClaudeCredentials = vi.fn(() => {
      ctx.host.fs.writeText(
        ctx.app.pluginDataDir + "/rate-limit-refresh-owned.json",
        JSON.stringify({ retryAt: Date.now() + 600000 })
      )
      throw message
    })
    const loaded = await plugin()
    expect(() => loaded.probe(ctx)).toThrow(message)
    expect(ctx.host.providerSecrets.refreshClaudeCredentials).toHaveBeenCalledOnce()
    expect(ctx.host.http.request).not.toHaveBeenCalled()
    expect(ctx.host.providerSecrets.read).not.toHaveBeenCalledWith("cookieHeader")
  }
)

it.each([401, 403])(
  "keeps the refresh hold when usage returns HTTP %s before recorded expiry",
  async (status) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-03T13:15:00Z"))
    vi.resetModules()
    const ctx = makeCtx()
    ctx.instanceRef = { providerId: "claude", instanceId: "owned" }
    const full = document("usagebar")
    full.claudeAiOauth.expiresAt = Date.now() + 3600000
    ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(full))
    ctx.host.providerSecrets.refreshClaudeCredentials = vi.fn()
    ctx.host.fs.writeText(
      ctx.app.pluginDataDir + "/rate-limit-refresh-owned.json",
      JSON.stringify({ retryAt: Date.now() + 600000 })
    )
    ctx.host.http.request.mockReturnValue({ status, bodyText: "{}" })
    const loaded = await plugin()
    expect(() => loaded.probe(ctx)).toThrow(
      "Usage request failed (HTTP 429). Try again after 2026-11-03T13:25:00.000Z."
    )
    expect(ctx.host.http.request).toHaveBeenCalledOnce()
    expect(ctx.host.providerSecrets.refreshClaudeCredentials).not.toHaveBeenCalled()
    expect(ctx.host.providerSecrets.read).not.toHaveBeenCalledWith("cookieHeader")
  }
)
