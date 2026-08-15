import { describe, expect, it } from "vitest"
import {
  loadModelPriceOverrides,
  normalizeModelPriceOverrides,
  reportEntryCost,
  saveModelPriceOverrides,
} from "@/lib/report-pricing"

describe("report pricing overrides", () => {
  it("recalculates known models and preserves recorded unknown-model cost", () => {
    const base = {
      providerId: "claude",
      source: "ccusage",
      timeZone: "UTC",
      periodStart: "2026-07-13T00:00:00Z",
      periodEnd: "2026-07-14T00:00:00Z",
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      costUsd: 99,
    }
    expect(
      reportEntryCost(
        { ...base, model: "sonnet" },
        { sonnet: { inputPerMillion: 3, outputPerMillion: 15 } }
      )
    ).toBe(10.5)
    expect(reportEntryCost({ ...base, model: "other" }, {})).toBe(99)
  })

  it("uses the recorded model price for each history row", () => {
    const base = {
      providerId: "codex",
      source: "ccusage",
      timeZone: "UTC",
      periodStart: "2026-07-13T00:00:00Z",
      periodEnd: "2026-07-14T00:00:00Z",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    }
    const overrides = {
      "gpt-5": { inputPerMillion: 2, outputPerMillion: 8 },
      "gpt-4.1": { inputPerMillion: 1, outputPerMillion: 3 },
    }

    expect(reportEntryCost({ ...base, model: "gpt-5" }, overrides)).toBe(10)
    expect(reportEntryCost({ ...base, model: "gpt-4.1" }, overrides)).toBe(4)
  })

  it("preserves an authoritative recorded zero when override inputs are missing", () => {
    expect(
      reportEntryCost(
        {
          providerId: "claude",
          source: "ccusage",
          timeZone: "UTC",
          periodStart: "2026-07-13T00:00:00Z",
          periodEnd: "2026-07-14T00:00:00Z",
          model: "sonnet",
          costUsd: 0,
        },
        { sonnet: { inputPerMillion: 3, outputPerMillion: 15 } }
      )
    ).toBe(0)
  })

  it("does not treat a missing core token field as zero", () => {
    expect(
      reportEntryCost(
        {
          providerId: "claude",
          source: "ccusage",
          timeZone: "UTC",
          periodStart: "2026-07-13T00:00:00Z",
          periodEnd: "2026-07-14T00:00:00Z",
          model: "sonnet",
          inputTokens: 1_000_000,
          costUsd: 7,
        },
        { sonnet: { inputPerMillion: 3, outputPerMillion: 15 } }
      )
    ).toBe(7)
    expect(
      reportEntryCost(
        {
          providerId: "claude",
          source: "ccusage",
          timeZone: "UTC",
          periodStart: "2026-07-13T00:00:00Z",
          periodEnd: "2026-07-14T00:00:00Z",
          model: "sonnet",
          inputTokens: 1_000_000,
        },
        { sonnet: { inputPerMillion: 3, outputPerMillion: 15 } }
      )
    ).toBeNull()
  })

  it("drops invalid and negative prices", () => {
    expect(
      normalizeModelPriceOverrides({ bad: { inputPerMillion: -1, outputPerMillion: 2 } })
    ).toEqual({})
  })

  it("does not require native storage outside Tauri", async () => {
    await expect(loadModelPriceOverrides()).resolves.toEqual({})
    await expect(
      saveModelPriceOverrides({ sonnet: { inputPerMillion: 3, outputPerMillion: 15 } })
    ).resolves.toBeUndefined()
  })
})
