import { render, screen, within } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(() => Promise.resolve()),
}))

import { GeneralSettingsPane } from "@/components/settings/general-settings-pane"

type PaneProps = ComponentProps<typeof GeneralSettingsPane>

const defaultProps: PaneProps = {
  autoUpdateInterval: 15,
  onAutoUpdateIntervalChange: vi.fn(),
  themeMode: "system",
  onThemeModeChange: vi.fn(),
  accentColor: "#86c5ff",
  onAccentColorChange: vi.fn(),
  displayMode: "used",
  onDisplayModeChange: vi.fn(),
  resetTimerDisplayMode: "relative",
  onResetTimerDisplayModeChange: vi.fn(),
  timeFormatMode: "auto",
  onTimeFormatModeChange: vi.fn(),
  menubarIconStyle: "provider",
  onMenubarIconStyleChange: vi.fn(),
  trayProviderSelection: "first",
  onTrayProviderSelectionChange: vi.fn(),
  showHistoryInBar: true,
  onShowHistoryInBarChange: vi.fn(),
  traySettingsPreview: { bars: [], providerBars: [], providerPercentText: "–" },
  globalShortcut: null,
  onGlobalShortcutChange: vi.fn(),
  startOnLogin: false,
  onStartOnLoginChange: vi.fn(),
  onResetAllSettings: vi.fn(async () => undefined),
}

function tabStops(groupName: string) {
  return within(screen.getByRole("radiogroup", { name: groupName }))
    .getAllByRole("radio")
    .filter((radio) => radio.tabIndex === 0)
}

describe("GeneralSettingsPane", () => {
  it("moves the radio tab stop to the checked option after an async value change", () => {
    const { rerender } = render(<GeneralSettingsPane {...defaultProps} />)
    expect(tabStops("Theme mode")).toEqual([screen.getByRole("radio", { name: "System" })])

    // Stored settings load after the first render.
    rerender(<GeneralSettingsPane {...defaultProps} themeMode="dark" accentColor="#eb4600" />)

    const dark = screen.getByRole("radio", { name: "Dark" })
    expect(dark).toHaveAttribute("aria-checked", "true")
    expect(tabStops("Theme mode")).toEqual([dark])
    expect(tabStops("Accent color")).toEqual([screen.getByRole("radio", { name: "Orange" })])
  })

  it("draws unselected accent labels in the neutral foreground", () => {
    render(<GeneralSettingsPane {...defaultProps} accentColor="#bfff00" />)

    const red = screen.getByRole("radio", { name: "Red" })
    expect(red).toHaveClass("text-foreground")
    expect(red.style.color).toBe("")
    expect(red.querySelector("[aria-hidden='true']")).toHaveStyle({
      backgroundColor: "#c1121f",
    })
  })

  it("lays out the three tray icon styles in one row", () => {
    render(<GeneralSettingsPane {...defaultProps} />)

    expect(screen.getByRole("radiogroup", { name: "Tray icon style" })).toHaveClass(
      "sm:grid-cols-3"
    )
  })
})
