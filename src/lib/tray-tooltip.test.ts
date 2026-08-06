import { describe, expect, it } from "vitest"

import type { PluginMeta } from "@/lib/plugin-types"
import { formatTrayBarsTooltip, formatTrayTooltip } from "@/lib/tray-tooltip"

const resetsAt = "2026-07-24T18:00:00Z"
const nowMs = Date.parse("2026-07-24T12:00:00Z")
const pluginsMeta: PluginMeta[] = [
  { id: "alpha", name: "Alpha", iconUrl: "", primaryCandidates: ["Session"], lines: [] },
  { id: "beta", name: "Beta", iconUrl: "", primaryCandidates: ["Session"], lines: [] },
  { id: "gamma", name: "Gamma", iconUrl: "", primaryCandidates: ["Session"], lines: [] },
  { id: "delta", name: "Delta", iconUrl: "", primaryCandidates: ["Session"], lines: [] },
]

describe("formatTrayBarsTooltip", () => {
  it("lists the four stacked provider values", () => {
    expect(
      formatTrayBarsTooltip(
        [
          { id: "alpha", fraction: 1 },
          { id: "beta", fraction: 0.75 },
          { id: "gamma", fraction: 0.5 },
          { id: "delta", fraction: 0.25 },
        ],
        pluginsMeta
      )
    ).toBe("UsageBar\nAlpha: 100%\nBeta: 75%\nGamma: 50%\nDelta: 25%")
  })
})

describe("formatTrayTooltip", () => {
  it("includes provider, metric, exact remaining value and reset time", () => {
    expect(
      formatTrayTooltip(
        {
          kind: "value",
          providerId: "alpha",
          providerName: "Alpha",
          metricLabel: "Session",
          remainingPercentExact: 36.42,
          resetsAt,
        },
        { nowMs, timeFormatMode: "24h", timeZone: "Europe/Berlin" }
      )
    ).toBe("UsageBar\nAlpha — Session\nRemaining: 36.42%\nResets today at 20:00")
  })

  it("keeps unknown distinct from zero", () => {
    expect(
      formatTrayTooltip(
        {
          kind: "unknown",
          providerId: "alpha",
          providerName: "Alpha",
          metricLabel: "Session",
          reason: "no-data",
        },
        { nowMs }
      )
    ).toBe("UsageBar\nAlpha — Session\nRemaining: –\nReset: Unknown")
  })

  it("surfaces current errors and labels retained data as last known", () => {
    expect(
      formatTrayTooltip(
        {
          kind: "error",
          providerId: "alpha",
          providerName: "Alpha",
          metricLabel: "Session",
          errorMessage: "Could not refresh",
          errorCategory: "providerResponse",
          lastKnownRemainingPercentExact: 36.4,
          lastKnownResetsAt: resetsAt,
        },
        { nowMs, timeFormatMode: "24h", timeZone: "Europe/Berlin" }
      )
    ).toBe(
      "UsageBar\nAlpha — Session\nUpdate failed\nLast known: 36.4% remaining\nLast known reset: Resets today at 20:00"
    )
  })
})
