import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { MetricLineRenderer } from "@/components/metric-line-renderer"
import type { MetricLine } from "@/lib/plugin-types"

function renderLine(line: MetricLine) {
  return render(
    <MetricLineRenderer
      line={line}
      displayMode="used"
      resetTimerDisplayMode="relative"
      now={Date.parse("2026-08-15T12:00:00Z")}
    />
  )
}

describe("MetricLineRenderer", () => {
  it("shows an authoritative zero instead of an unknown marker", () => {
    renderLine({
      type: "progress",
      label: "Session",
      used: 0,
      limit: 100,
      format: { kind: "percent" },
    })

    expect(screen.getByText("0% used")).toBeInTheDocument()
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0")
  })

  it("shows unknown when a provider omits a progress value", () => {
    renderLine({
      type: "progress",
      label: "Session",
      used: null,
      limit: 100,
      format: { kind: "percent" },
    })

    expect(screen.getByText("—")).toHaveAttribute("title", "Unknown")
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("shows not available for an explicitly unsupported metric", () => {
    renderLine({
      type: "progress",
      label: "Session",
      used: null,
      limit: null,
      availability: "unsupported",
      format: { kind: "percent" },
    })

    expect(screen.getByText("Not available")).toHaveAttribute("title", "Not available")
  })
})
