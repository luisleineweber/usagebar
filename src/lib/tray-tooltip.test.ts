import { describe, expect, it } from "vitest"

import { formatTrayTooltip } from "@/lib/tray-tooltip"

const resetsAt = "2026-07-24T18:00:00Z"
const nowMs = Date.parse("2026-07-24T12:00:00Z")

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
