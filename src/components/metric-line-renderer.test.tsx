import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { MetricLineRenderer } from "@/components/metric-line-renderer"
import type { MetricLine } from "@/lib/plugin-types"

function renderLine(line: MetricLine) {
  return render(
    <MetricLineRenderer
      providerName="Alpha"
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

  it("names the progress bar by provider and metric and matches the visible value", () => {
    render(
      <MetricLineRenderer
        providerName="Codex"
        line={{
          type: "progress",
          label: "Session",
          used: 62,
          limit: 100,
          format: { kind: "percent" },
        }}
        displayMode="left"
        resetTimerDisplayMode="relative"
        now={Date.parse("2026-08-15T12:00:00Z")}
      />
    )

    const bar = screen.getByRole("progressbar", { name: "Codex Session" })
    expect(bar).toHaveAttribute("aria-valuetext", "38% left")
    expect(screen.getByText("38% left")).toBeInTheDocument()
  })

  it("marks an on-track pace with a neutral dot and an over-pace deficit as below pace", () => {
    const now = Date.parse("2026-08-15T12:00:00Z")
    const periodDurationMs = 10 * 60 * 60 * 1000
    const { rerender } = render(
      <MetricLineRenderer
        providerName="Codex"
        line={{
          type: "progress",
          label: "Session",
          used: 45,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: new Date(now + periodDurationMs / 2).toISOString(),
          periodDurationMs,
        }}
        displayMode="left"
        resetTimerDisplayMode="relative"
        now={now}
      />
    )
    const onTrackDot = screen.getByText("On track").previousElementSibling
    expect(onTrackDot).toHaveClass("bg-muted-foreground")
    expect(onTrackDot).not.toHaveClass("bg-yellow-500")

    rerender(
      <MetricLineRenderer
        providerName="Codex"
        line={{
          type: "progress",
          label: "Session",
          used: 59,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: new Date(now + periodDurationMs / 2).toISOString(),
          periodDurationMs,
        }}
        displayMode="left"
        resetTimerDisplayMode="relative"
        now={now}
      />
    )
    expect(screen.getByText("9% below pace")).toBeInTheDocument()
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
