import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

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

  it("explains the restart fallback of the last opened provider", () => {
    render(
      <SurfacePinSettings
        menubarIconStyle="provider"
        trayProviderSelection="last"
        preview={preview}
      />
    )

    expect(
      screen.getByText(
        "Shows the first provider until you open one after a restart."
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
