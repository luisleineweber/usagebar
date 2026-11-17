import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

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
