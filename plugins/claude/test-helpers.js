import { vi } from "vitest"

// These tests exercise UsageBar-owned refresh. Local Claude Code documents are
// covered separately and must never reach the token endpoint.
export function ownCredentials(ctx) {
  const keychain = ctx.host.keychain.readGenericPassword()
  const raw = keychain || ctx.host.fs.readText("~/.claude/.credentials.json")
  const document = JSON.parse(raw)
  document.usagebarCredentialOwner = "usagebar"
  ctx.instanceRef = { providerId: "claude", instanceId: "owned-test" }
  let stored = JSON.stringify(document)
  ctx.host.providerSecrets.read.mockImplementation(() => stored)
  ctx.host.providerSecrets.write.mockImplementation((_key, value) => {
    stored = value
  })
  ctx.host.providerSecrets.refreshClaudeCredentials = vi.fn((json) => {
    const options = JSON.parse(json)
    const full = JSON.parse(stored)
    let response
    try {
      response = ctx.host.http.request({
        method: "POST",
        url: options.refreshUrl,
        bodyText: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: full.claudeAiOauth.refreshToken,
          client_id: options.clientId,
          scope: options.scopes,
        }),
      })
    } catch {
      return JSON.stringify({ credentials: null, response: null })
    }
    let credentials = null
    let body
    try {
      body = JSON.parse(response.bodyText)
    } catch {
      body = null
    }
    if (
      response.status >= 200 &&
      response.status < 300 &&
      typeof body?.access_token === "string" &&
      body.access_token.trim()
    ) {
      full.claudeAiOauth.accessToken = body.access_token
      if (typeof body.refresh_token === "string" && body.refresh_token.trim())
        full.claudeAiOauth.refreshToken = body.refresh_token
      const expiresAt =
        Number.isFinite(body.expires_in) && body.expires_in > 0
          ? Date.now() + body.expires_in * 1000
          : null
      full.claudeAiOauth.expiresAt = Number.isFinite(expiresAt) ? expiresAt : null
      credentials = JSON.stringify(full)
      ctx.host.providerSecrets.write("account:owned-test:authJson", credentials)
    }
    return JSON.stringify({ credentials, response })
  })
}
