import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SurfacePinSettings } from "@/components/settings/surface-pin-settings"
import type { PluginMeta } from "@/lib/plugin-types"
import type { SurfacePin } from "@/lib/settings"

const plugins: PluginMeta[] = [
  {
    id: "codex",
    name: "Codex",
    iconUrl: "/codex.svg",
    lines: [
      { type: "progress", label: "Session", scope: "overview" },
      { type: "progress", label: "Weekly", scope: "overview" },
    ],
    primaryCandidates: ["Session"],
  },
  {
    id: "claude",
    name: "Claude",
    iconUrl: "/claude.svg",
    lines: [{ type: "progress", label: "Weekly", scope: "overview" }],
    primaryCandidates: ["Weekly"],
  },
]

const preview = {
  bars: [
    { id: "codex:Session", fraction: 0.42 },
    { id: "claude:Weekly", fraction: 0.73 },
  ],
  providerBars: [{ id: "codex:Session", fraction: 0.42 }],
  providerIconUrl: "/codex.svg",
  providerPercentText: "42%",
}

function renderSettings(pins: SurfacePin[], onPinsChange = vi.fn(), trayPreview = preview) {
  render(
    <SurfacePinSettings
      plugins={plugins}
      pins={pins}
      onPinsChange={onPinsChange}
      menubarIconStyle="bars"
      preview={trayPreview}
    />
  )
  return onPinsChange
}

describe("SurfacePinSettings", () => {
  it("adds the first metric with bar presentation", async () => {
    const onPinsChange = renderSettings([])

    await userEvent.selectOptions(screen.getByLabelText("Metric 1"), ["Codex: Session"])

    expect(onPinsChange).toHaveBeenCalledWith([
      { providerId: "codex", metricLabel: "Session", presentation: "bar" },
    ])
  })

  it("prevents duplicate pins and preserves saved order", () => {
    renderSettings([
      { providerId: "codex", metricLabel: "Session", presentation: "bar" },
      { providerId: "claude", metricLabel: "Weekly", presentation: "text" },
    ])

    const secondMetric = screen.getByLabelText("Metric 2")
    expect(within(secondMetric).getByRole("option", { name: "Codex: Session" })).toBeDisabled()
    expect(screen.getAllByText("Session")[0]).toBeInTheDocument()
    expect(screen.getAllByText("Weekly")[0]).toBeInTheDocument()
  })

  it("changes presentation and removes a metric", async () => {
    const pins: SurfacePin[] = [
      { providerId: "codex", metricLabel: "Session", presentation: "bar" },
    ]
    const onPinsChange = renderSettings(pins)

    await userEvent.click(screen.getByRole("radio", { name: "Text" }))
    expect(onPinsChange).toHaveBeenCalledWith([
      { providerId: "codex", metricLabel: "Session", presentation: "text" },
    ])

    await userEvent.selectOptions(screen.getByLabelText("Metric 1"), ["Remove metric"])
    expect(onPinsChange).toHaveBeenCalledWith([])
  })

  it("renders tray and widget previews from live fractions", () => {
    renderSettings([
      { providerId: "codex", metricLabel: "Session", presentation: "bar" },
      { providerId: "claude", metricLabel: "Weekly", presentation: "text" },
    ])

    expect(screen.getByAltText("Tray icon preview")).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image\/svg\+xml,/)
    )
    expect(screen.getByRole("progressbar", { name: "Session preview" })).toHaveAttribute(
      "aria-valuenow",
      "42"
    )
    expect(screen.queryByRole("progressbar", { name: "Weekly preview" })).not.toBeInTheDocument()
    expect(screen.getByText("73%")).toBeInTheDocument()
  })

  it("matches preview values by pin identity when unavailable pins are omitted", () => {
    renderSettings(
      [
        { providerId: "codex", metricLabel: "Session", presentation: "text" },
        { providerId: "claude", metricLabel: "Weekly", presentation: "text" },
      ],
      vi.fn(),
      {
        ...preview,
        bars: [{ id: "claude:Weekly", fraction: 0.73 }],
      }
    )
    const widget = screen.getByLabelText("Pinned metric widget preview")

    expect(within(widget).getByText("--%")).toBeInTheDocument()
    expect(within(widget).getByText("73%")).toBeInTheDocument()
  })
})
