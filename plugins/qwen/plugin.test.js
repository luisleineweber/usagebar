import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

describe("qwen plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("exposes local ccusage history", async () => {
    const ctx = makeCtx()
    ctx.host.ccusage.query.mockReturnValue({
      status: "ok",
      data: { daily: [{ date: "2026-07-20", totalTokens: 120, totalCost: 0.42 }] },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(ctx.host.ccusage.query).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "qwen", since: expect.any(String) })
    )
    expect(result.history.entries[0]).toMatchObject({ totalTokens: 120, costUsd: 0.42 })
  })
})
