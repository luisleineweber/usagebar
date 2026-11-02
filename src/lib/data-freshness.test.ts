import { describe, expect, it } from "vitest"
import { summarizeDataFreshness } from "@/lib/data-freshness"

describe("summarizeDataFreshness", () => {
  it("reports never when no provider has succeeded or failed", () => {
    expect(summarizeDataFreshness([{ error: null, lastSuccessAt: null }])).toEqual({
      kind: "never",
    })
  })

  it("reports the oldest success when no provider failed", () => {
    expect(
      summarizeDataFreshness([
        { error: null, lastSuccessAt: 2_000 },
        { error: null, lastSuccessAt: 1_000 },
      ])
    ).toEqual({ kind: "fresh", lastSuccessAt: 1_000 })
  })

  it("reports a failure instead of success when some providers failed", () => {
    expect(
      summarizeDataFreshness([
        { error: null, lastSuccessAt: 5_000 },
        { error: "Token expired", lastSuccessAt: 1_000 },
        { error: "Not signed in", lastSuccessAt: null },
      ])
    ).toEqual({ kind: "failed", failedCount: 2, totalCount: 3, lastSuccessAt: 5_000 })
  })
})
