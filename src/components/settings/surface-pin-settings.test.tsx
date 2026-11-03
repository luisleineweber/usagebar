import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

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

function mockSystemScheme(dark: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) =>
    Object.assign(new EventTarget(), {
      matches: dark && query === "(prefers-color-scheme: dark)",
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
    })
  )
}

describe("SurfacePinSettings", () => {
  afterEach(() => {
    vi.restoreAllMocks()
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

  it.each([
    [true, "dark", "rgb(32, 33, 36)"],
    [false, "light", "rgb(243, 243, 243)"],
  ] as const)(
    "follows the system color scheme for the taskbar surface (dark=%s)",
    (dark, scheme, background) => {
      mockSystemScheme(dark)
      render(
        <SurfacePinSettings menubarIconStyle="provider" accentColor="#86c5ff" preview={preview} />
      )

      const surface = screen.getByAltText("Tray icon preview").parentElement!
      expect(surface).toHaveAttribute("data-tray-scheme", scheme)
      expect(surface).toHaveStyle({ backgroundColor: background })
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
