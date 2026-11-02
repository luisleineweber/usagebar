import { describe, expect, it } from "vitest"
import { summarizeDataFreshness } from "@/lib/data-freshness"

describe("summarizeDataFreshness", () => {
  it("reports never when no provider has succeeded or failed", () => {
    expect(summarizeDataFreshness([{ loading: false, error: null, lastSuccessAt: null }])).toEqual(
      { kind: "never" }
    )
  })

  it("reports the oldest success when no provider failed", () => {
    expect(
      summarizeDataFreshness([
        { loading: false, error: null, lastSuccessAt: 2_000 },
        { loading: false, error: null, lastSuccessAt: 1_000 },
      ])
    ).toEqual({ kind: "fresh", lastSuccessAt: 1_000 })
  })

  it("reports a failure instead of success when some providers failed", () => {
    expect(
      summarizeDataFreshness([
        { loading: false, error: null, lastSuccessAt: 5_000 },
        { loading: false, error: "Token expired", lastSuccessAt: 1_000 },
        { loading: false, error: "Not signed in", lastSuccessAt: null },
      ])
    ).toEqual({ kind: "failed", failedCount: 2, totalCount: 3, lastSuccessAt: 5_000 })
  })

  it("never reports fresh while a retried provider is still loading", () => {
    // success -> failure -> retry: the probe state clears the error and keeps lastSuccessAt.
    const success = { loading: false, error: null, lastSuccessAt: 1_000 }
    const failure = { loading: false, error: "Token expired", lastSuccessAt: 1_000 }
    const retrying = { loading: true, error: null, lastSuccessAt: 1_000 }

    expect(summarizeDataFreshness([success])).toEqual({ kind: "fresh", lastSuccessAt: 1_000 })
    expect(summarizeDataFreshness([failure]).kind).toBe("failed")
    expect(summarizeDataFreshness([retrying])).toEqual({ kind: "refreshing" })
  })

  it("keeps a settled failure visible while another provider is loading", () => {
    expect(
      summarizeDataFreshness([
        { loading: false, error: "Token expired", lastSuccessAt: null },
        { loading: true, error: null, lastSuccessAt: 1_000 },
      ])
    ).toEqual({ kind: "failed", failedCount: 1, totalCount: 2, lastSuccessAt: null })
  })
})
