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
        <SurfacePinSettings
          menubarIconStyle="provider"
          trayProviderSelection="first"
          preview={preview}
        />
      )

      const image = screen.getByAltText("Tray icon preview")
      expect(decodeURIComponent(image.getAttribute("src") ?? "")).toContain(`fill="${fill}"`)
      expect(image.parentElement).toHaveAttribute("data-taskbar-theme", taskbarTheme)
      expect(image.parentElement).toHaveStyle({ backgroundColor: background })
    }
  )

  it("does not draw the number preview before the taskbar theme is known", () => {
    taskbar.useTrayNumberSurface.mockReturnValue(null)
    render(
      <SurfacePinSettings
        menubarIconStyle="provider"
        trayProviderSelection="first"
        preview={preview}
      />
    )

    expect(screen.queryByAltText("Tray icon preview")).not.toBeInTheDocument()
  })

  it("renders stacked-bars guidance without provider selection or preview name", () => {
    render(
      <SurfacePinSettings menubarIconStyle="bars" trayProviderSelection="first" preview={preview} />
    )

    expect(screen.getByAltText("Tray icon preview")).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image\/svg\+xml,/)
    )
    expect(screen.getByText("Stacked bars show the first four providers.")).toBeInTheDocument()
    expect(screen.queryByText(/Preview:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Metric [12]/)).not.toBeInTheDocument()
  })

  it("explains the latest provider in the live preview", () => {
    render(
      <SurfacePinSettings
        menubarIconStyle="provider"
        trayProviderSelection="last"
        preview={preview}
      />
    )

    expect(
      screen.getByText(
        "Starts with the first provider. After you leave a provider, Dashboard and History show that latest provider until you leave another one. This resets after restart."
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/Preview:/)).not.toBeInTheDocument()
  })

  it.each(["provider", "bars", "donut"] as const)(
    "does not show a provider name in the %s preview",
    (menubarIconStyle) => {
      render(
        <SurfacePinSettings
          menubarIconStyle={menubarIconStyle}
          trayProviderSelection="first"
          preview={preview}
        />
      )

      expect(screen.queryByText(/Preview:/)).not.toBeInTheDocument()
    }
  )
})
