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

  it("shows Zen pay-as-you-go balance from the billing response", async () => {
    const ctx = makeCtx()
    setManualCookie(ctx)
    const workspaceId = setWorkspace(ctx)
    ctx.host.http.request.mockReturnValue(
      response(JSON.stringify({
        billing: {
          currentBalance: 12.34,
        },
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
    expect(result.lines).toEqual([
      {
        type: "text",
        label: "Balance",
        value: "$12.34",
        subtitle: "OpenCode Zen pay-as-you-go balance",
      },
    ])
  })

  it("reads zero Zen balance from cent-denominated fields", async () => {
    const ctx = makeCtx()
    setManualCookie(ctx)
    setWorkspace(ctx)
    ctx.host.http.request.mockReturnValue(
      response(JSON.stringify({
        data: {
          zen: {
            balanceCents: 0,
          },
        },
      }))
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines[0]).toMatchObject({ label: "Balance", value: "$0.00" })
  })

  it("reads Zen balance from serialized server text", async () => {
    const ctx = makeCtx()
    setManualCookie(ctx)
    setWorkspace(ctx)
    ctx.host.http.request.mockReturnValue(
      response("return { currentBalance: 5.25, billing: true }")
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines[0]).toMatchObject({ label: "Balance", value: "$5.25" })
  })

  it("falls back to the billing page hydrated balance", async () => {
    const ctx = makeCtx()
    setManualCookie(ctx)
    const workspaceId = setWorkspace(ctx, "wrk_01KGFHEAF5E5M17063C23DR6ZH")
    ctx.host.http.request
      .mockReturnValueOnce(response(JSON.stringify({
        customerID: null,
        paymentMethodID: null,
      })))
      .mockReturnValueOnce(response(`
        <script>
          _$HY.r["billing.get[\\"${workspaceId}\\"]"] = $R[15];
          $R[22]($R[16], $R[25] = {
            customerID: null,
            paymentMethodID: null,
            balance: 0,
            monthlyUsage: 0
          });
        </script>
      `))

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: "GET",
      url: `https://opencode.ai/workspace/${workspaceId}/billing`,
      headers: expect.objectContaining({
        Cookie: "auth=test; __Host-auth=test2",
      }),
    }))
    expect(result.lines[0]).toMatchObject({ label: "Balance", value: "$0.00" })
  })

  it("surfaces explicit null Zen billing responses as no usage data", async () => {
    const ctx = makeCtx()
    setManualCookie(ctx)
    setWorkspace(ctx, "wrk_nullcase")
    ctx.host.http.request.mockReturnValue(response("null"))

    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow("OpenCode Zen has no billing usage data for this workspace.")
  })

  it("surfaces missing balance fields as a workspace-or-response-shape problem", async () => {
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
        ", but it did not include the expected Zen balance field. Verify the workspace ID from the billing URL or an opencode.ai/_server payload. If that workspace is correct, OpenCode likely changed the billing response shape."
    )
    expect(ctx.host.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("opencode zen billing response missing balance for " + workspaceId)
    )
  })
})
