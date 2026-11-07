import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const taskbar = vi.hoisted(() => ({ useTrayNumberSurface: vi.fn() }))
vi.mock("@/hooks/use-taskbar-theme", () => taskbar)

import { SurfacePinSettings } from "@/components/settings/surface-pin-settings"

const preview = {
  bars: [{ id: "codex", fraction: 0.42 }],
  providerBars: [{ id: "codex", fraction: 0.42 }],
  providerIconUrl: "/codex.svg",
  providerPercentText: "42%",
  state: {
    kind: "value" as const,
    providerId: "codex",
    providerName: "Codex",
    metricLabel: "Session",
    remainingPercentExact: 42,
    resetsAt: null,
  },
}

function previewSvg() {
  const src = screen.getByAltText("Tray icon preview").getAttribute("src") ?? ""
  return decodeURIComponent(src.replace("data:image/svg+xml,", ""))
}

describe("SurfacePinSettings", () => {
  beforeEach(() => {
    taskbar.useTrayNumberSurface.mockReset()
    taskbar.useTrayNumberSurface.mockReturnValue("dark")
  })

  it.each([
    { taskbarTheme: "light", fill: "#111827", background: "rgb(243, 243, 243)" },
    { taskbarTheme: "dark", fill: "#ffffff", background: "rgb(32, 32, 32)" },
  ] as const)(
    "draws the number preview for the $taskbarTheme taskbar",
    ({ taskbarTheme, fill, background }) => {
      taskbar.useTrayNumberSurface.mockReturnValue(taskbarTheme)
      render(
        <SurfacePinSettings menubarIconStyle="provider" accentColor="#86c5ff" preview={preview} />
      )

      const image = screen.getByAltText("Tray icon preview")
      expect(previewSvg()).toContain(`fill="${fill}"`)
      expect(image.parentElement).toHaveAttribute("data-taskbar-theme", taskbarTheme)
      expect(image.parentElement).toHaveStyle({ backgroundColor: background })
    }
  )

  it("does not draw the number preview before the taskbar theme is known", () => {
    taskbar.useTrayNumberSurface.mockReturnValue(null)
    render(
      <SurfacePinSettings menubarIconStyle="provider" accentColor="#86c5ff" preview={preview} />
    )

    expect(screen.queryByAltText("Tray icon preview")).not.toBeInTheDocument()
  })

  it.each(["bars", "donut"] as const)(
    "draws the %s preview in the selected accent color like the Windows tray",
    (menubarIconStyle) => {
      render(
        <SurfacePinSettings
          menubarIconStyle={menubarIconStyle}
          accentColor="#e07c8e"
          preview={preview}
        />
      )

      expect(previewSvg()).toContain("#e07c8e")
      expect(previewSvg()).not.toContain("#86c5ff")
    }
  )

  it("renders the preview image without explanatory text", () => {
    render(<SurfacePinSettings menubarIconStyle="bars" accentColor="#86c5ff" preview={preview} />)

    expect(screen.getByAltText("Tray icon preview")).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image\/svg\+xml,/)
    )
    expect(screen.queryByText(/Stacked bars show/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Metric [12]/)).not.toBeInTheDocument()
  })

  it.each(["provider", "bars", "donut"] as const)(
    "does not show a provider name in the %s preview",
    (menubarIconStyle) => {
      render(
        <SurfacePinSettings
          menubarIconStyle={menubarIconStyle}
          accentColor="#86c5ff"
          preview={preview}
        />
      )

      expect(screen.queryByText(/Preview:/)).not.toBeInTheDocument()
    }
  )
})
