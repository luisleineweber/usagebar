import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function response(bodyText, status = 200) {
  return { status, bodyText, headers: {} }
}

function setManualCookie(ctx, cookieHeader = "auth=test; __Host-auth=test2") {
  ctx.host.providerSecrets.read.mockImplementation((key) => (key === "cookieHeader" ? cookieHeader : null))
}

function setWorkspace(ctx, workspaceId = "wrk_01TESTWORKSPACE") {
  ctx.host.providerConfig = {
    get: vi.fn((key) => {
      if (key === "source") return "manual"
      if (key === "workspaceId") return workspaceId
      return null
    }),
  }
  return workspaceId
}

describe("opencode plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("throws when no cookie header is configured", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow("Set OPENCODE_COOKIE_HEADER to your OpenCode cookie header.")
  })

  it("parses session and weekly usage from the subscription response", async () => {
    const ctx = makeCtx()
    setManualCookie(ctx)
    const workspaceId = setWorkspace(ctx)
    ctx.host.http.request.mockReturnValue(
      response(JSON.stringify({
        rollingUsage: { usagePercent: 42, resetInSec: 1800 },
        weeklyUsage: { usagePercent: 17, resetInSec: 86400 },
      }))
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledWith(expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({
        Cookie: "auth=test; __Host-auth=test2",
        Referer: `https://opencode.ai/workspace/${workspaceId}/billing`,
      }),
    }))
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0]).toMatchObject({ label: "Session", used: 42, limit: 100 })
    expect(result.lines[1]).toMatchObject({ label: "Weekly", used: 17, limit: 100 })
  })

  it("surfaces explicit null subscription responses as no subscription data", async () => {
    const ctx = makeCtx()
    setManualCookie(ctx)
    setWorkspace(ctx, "wrk_nullcase")
    ctx.host.http.request.mockReturnValue(response("null"))

    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow("OpenCode has no subscription usage data for this workspace.")
  })

  it("surfaces missing billing fields as a workspace-or-response-shape problem", async () => {
    const ctx = makeCtx()
    setManualCookie(ctx)
    const workspaceId = setWorkspace(ctx, "wrk_shapeproblem")
    ctx.host.http.request.mockReturnValue(
      response(JSON.stringify({
        usage: { percent: 50 },
        plan: { name: "Team" },
      }))
    )

    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow(
      "OpenCode returned billing data for workspace " +
        workspaceId +
        ", but it did not include the expected usage fields (rolling usage percent, rolling reset, weekly usage percent, weekly reset). Verify the workspace ID from the billing URL or an opencode.ai/_server payload. If that workspace is correct, OpenCode likely changed the billing response shape."
    )
    expect(ctx.host.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("opencode subscription response missing fields for " + workspaceId)
    )
  })
})
