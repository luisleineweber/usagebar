import { cleanup, render, screen } from "@testing-library/react"
import { useState } from "react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { openUrl } from "@tauri-apps/plugin-opener"

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(() => Promise.resolve()),
}))

import { SettingsPage } from "@/pages/settings"
import { orderSettingsProviders } from "@/components/settings/providers-settings-pane"
import type { SettingsPluginState } from "@/hooks/app/use-settings-plugin-list"
import { PROJECT_ISSUES_URL } from "@/lib/project-metadata"

const providers: SettingsPluginState[] = [
  {
    id: "opencode",
    name: "OpenCode Zen",
    iconUrl: "/opencode.svg",
    brandColor: "#16a34a",
    enabled: true,
    supported: true,
    supportState: "experimental",
    supportMessage: "Experimental on Windows.",
    meta: {
      id: "opencode",
      name: "OpenCode Zen",
      iconUrl: "/opencode.svg",
      brandColor: "#16a34a",
      supportState: "experimental",
      supportMessage: "Experimental on Windows.",
      lines: [],
      primaryCandidates: [],
    },
    state: {
      data: null,
      loading: false,
      error: null,
      lastManualRefreshAt: null,
      lastSuccessAt: null,
    },
    config: { source: "manual", workspaceId: "wrk_123" },
  },
  {
    id: "codex",
    name: "Codex",
    iconUrl: "/codex.svg",
    brandColor: "#000000",
    enabled: false,
    supported: true,
    supportState: "supported",
    supportMessage: null,
    meta: {
      id: "codex",
      name: "Codex",
      iconUrl: "/codex.svg",
      brandColor: "#000000",
      lines: [],
      primaryCandidates: [],
    },
    state: {
      data: null,
      loading: false,
      error: "Not signed in",
      lastManualRefreshAt: null,
      lastSuccessAt: null,
    },
  },
]

const defaultProps = {
  providers,
  onToggle: vi.fn(),
  autoUpdateInterval: 15 as const,
  onAutoUpdateIntervalChange: vi.fn(),
  themeMode: "system" as const,
  onThemeModeChange: vi.fn(),
  accentColor: "#86c5ff" as const,
  onAccentColorChange: vi.fn(),
  displayMode: "used" as const,
  onDisplayModeChange: vi.fn(),
  resetTimerDisplayMode: "relative" as const,
  onResetTimerDisplayModeChange: vi.fn(),
  timeFormatMode: "auto" as const,
  onTimeFormatModeChange: vi.fn(),
  menubarIconStyle: "provider" as const,
  onMenubarIconStyleChange: vi.fn(),
  trayProviderSelection: "first" as const,
  onTrayProviderSelectionChange: vi.fn(),
  showHistoryInBar: true,
  onShowHistoryInBarChange: vi.fn(),
  traySettingsPreview: {
    bars: [],
    providerBars: [],
    providerPercentText: "–",
  },
  globalShortcut: null,
  onGlobalShortcutChange: vi.fn(),
  startOnLogin: false,
  onStartOnLoginChange: vi.fn(),
  onProviderConfigChange: vi.fn(async () => undefined),
  onProviderSecretSave: vi.fn(async () => undefined),
  onProviderSecretDelete: vi.fn(async () => undefined),
  onRetryProvider: vi.fn(),
  providerConfigLoadError: null,
  onRetryProviderConfigs: vi.fn(async () => undefined),
}

function TestHarness(overrides: Partial<typeof defaultProps> = {}) {
  const [settingsTab, setSettingsTab] = useState<"general" | "providers">("general")
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(providers[0]!.id)

  return (
    <SettingsPage
      {...defaultProps}
      {...overrides}
      settingsTab={settingsTab}
      onSettingsTabChange={setSettingsTab}
      selectedProviderId={selectedProviderId}
      onSelectedProviderChange={setSelectedProviderId}
    />
  )
}

afterEach(() => {
  cleanup()
})

describe("SettingsPage", () => {
  it("keeps the primary four providers ahead of the alphabetical remainder", () => {
    const ordered = orderSettingsProviders([
      { id: "zed", name: "Zed" },
      { id: "opencode", name: "OpenCode Zen" },
      { id: "opencode-go", name: "OpenCode" },
      { id: "claude", name: "Claude" },
      { id: "amp", name: "Amp" },
      { id: "cursor", name: "Cursor" },
      { id: "codex", name: "Codex" },
      { id: "abacus", name: "Abacus" },
    ])

    expect(ordered.map((provider) => provider.id)).toEqual([
      "codex",
      "claude",
      "cursor",
      "opencode-go",
      "abacus",
      "amp",
      "opencode",
      "zed",
    ])
  })

  it("renders General and Providers tabs", () => {
    render(<TestHarness />)
    expect(screen.getByRole("tab", { name: "General" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Providers" })).toBeInTheDocument()
  })

  it("shows a retryable provider settings load error", async () => {
    const onRetryProviderConfigs = vi.fn(async () => undefined)
    render(
      <TestHarness
        providerConfigLoadError="Provider settings could not be loaded."
        onRetryProviderConfigs={onRetryProviderConfigs}
      />
    )

    expect(screen.getByRole("alert")).toHaveTextContent("Provider settings unavailable")
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))

    expect(onRetryProviderConfigs).toHaveBeenCalledOnce()
  })

  it("uses responsive layout classes for narrow settings widths", () => {
    const { container } = render(<TestHarness />)

    expect(container.querySelector(".grid-cols-2.lg\\:grid-cols-4")).toBeTruthy()
    expect(container.querySelector(".sm\\:grid-cols-2")).toBeTruthy()
    expect(container.querySelector(".sm\\:grid-cols-3")).toBeTruthy()
  })

  it("keeps provider rows readable on narrower layouts", () => {
    const { container } = render(
      <SettingsPage
        {...defaultProps}
        settingsTab="providers"
        onSettingsTabChange={vi.fn()}
        selectedProviderId="opencode"
        onSelectedProviderChange={vi.fn()}
      />
    )

    expect(container.querySelector(".flex-wrap.items-start.gap-3")).toBeTruthy()
  })

  it("renders global settings on the General tab", () => {
    render(<TestHarness />)
    expect(screen.getByText("Auto Refresh")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Navigation" })).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: /show history in bar/i })).toBeChecked()
    expect(screen.queryByText("Menubar Icon")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /report an issue/i })).toBeInTheDocument()
  })

  it("updates History visibility from the Navigation section", async () => {
    const onShowHistoryInBarChange = vi.fn()
    render(<TestHarness onShowHistoryInBarChange={onShowHistoryInBarChange} />)

    await userEvent.click(screen.getByRole("checkbox", { name: /show history in bar/i }))

    expect(onShowHistoryInBarChange).toHaveBeenCalledWith(false)
  })

  it("keeps the current tray style controls available on Windows", async () => {
    const user = userEvent.setup()
    const onMenubarIconStyleChange = vi.fn()
    render(<TestHarness onMenubarIconStyleChange={onMenubarIconStyleChange} />)

    expect(screen.getByRole("radio", { name: "Compact" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Stacked bars" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Donut" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "First provider" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Latest provider" })).toBeInTheDocument()
    expect(screen.queryByRole("radio", { name: "Merged" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("radio", { name: "Stacked bars" }))
    expect(onMenubarIconStyleChange).toHaveBeenCalledWith("bars")
  })

  it("hides provider selection for stacked bars", () => {
    render(<TestHarness menubarIconStyle="bars" />)

    expect(screen.queryByRole("radio", { name: "First provider" })).not.toBeInTheDocument()
    expect(screen.queryByRole("radio", { name: "Latest provider" })).not.toBeInTheDocument()
    expect(screen.getByText("Stacked bars show the first four providers.")).toBeInTheDocument()
  })

  it("updates tray provider selection", async () => {
    const onTrayProviderSelectionChange = vi.fn()
    render(<TestHarness onTrayProviderSelectionChange={onTrayProviderSelectionChange} />)

    await userEvent.click(screen.getByRole("radio", { name: "Latest provider" }))

    expect(onTrayProviderSelectionChange).toHaveBeenCalledWith("last")
  })

  it("opens the issue tracker from the General tab", async () => {
    render(<TestHarness />)

    await userEvent.click(screen.getByRole("button", { name: /report an issue/i }))

    expect(openUrl).toHaveBeenCalledWith(PROJECT_ISSUES_URL)
  })

  it("switches to the Providers tab and shows provider detail", async () => {
    render(<TestHarness />)
    await userEvent.click(screen.getByRole("tab", { name: "Providers" }))

    expect(screen.getByTestId("provider-settings-opencode")).toBeInTheDocument()
    expect(screen.getByText("Experimental on Windows.")).toBeInTheDocument()
  })

  it("selects another provider from the Providers tab", async () => {
    render(<TestHarness />)
    await userEvent.click(screen.getByRole("tab", { name: "Providers" }))
    await userEvent.click(screen.getByRole("button", { name: /codex/i }))

    expect(screen.getByTestId("provider-settings-codex")).toBeInTheDocument()
    expect(screen.getAllByText("Not signed in").length).toBeGreaterThan(0)
  })

  it("keeps provider-row clicks inside Settings", async () => {
    const onSelectedProviderChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        settingsTab="providers"
        onSettingsTabChange={vi.fn()}
        selectedProviderId="opencode"
        onSelectedProviderChange={onSelectedProviderChange}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: /codex/i }))

    expect(onSelectedProviderChange).toHaveBeenCalledWith("codex")
  })

  it("shows an explicit tray-open action for the selected provider", async () => {
    render(<TestHarness />)
    await userEvent.click(screen.getByRole("tab", { name: "Providers" }))

    expect(screen.getByRole("button", { name: /open in tray/i })).toBeInTheDocument()
  })

  it("lists providers alphabetically without drag controls", async () => {
    render(<TestHarness />)
    await userEvent.click(screen.getByRole("tab", { name: "Providers" }))

    const codexRow = screen.getByRole("button", { name: /^codexnot signed in/i })
    const openCodeRow = screen.getByRole("button", {
      name: /^opencode zenexperimental on windows/i,
    })

    expect(codexRow.compareDocumentPosition(openCodeRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
    expect(codexRow.querySelector(".cursor-grab")).not.toBeInTheDocument()
    expect(openCodeRow.querySelector(".cursor-grab")).not.toBeInTheDocument()
  })

  it("does not clip provider icons with rounded containers", async () => {
    const { container } = render(<TestHarness />)
    await userEvent.click(screen.getByRole("tab", { name: "Providers" }))

    const providerIcons = container.querySelectorAll('[data-testid="provider-icon"]')
    expect(providerIcons.length).toBeGreaterThan(0)
    providerIcons.forEach((icon) => {
      expect(icon.className).not.toMatch(/rounded/)
    })
  })

  it("toggles providers from the Providers tab", async () => {
    const onToggle = vi.fn()
    render(<TestHarness onToggle={onToggle} />)
    await userEvent.click(screen.getByRole("tab", { name: "Providers" }))

    const codexRow = screen.getByRole("button", { name: /codex/i })
    const checkbox = screen.getByRole("checkbox", { name: "Enable Codex" })
    expect(codexRow).not.toContainElement(checkbox)
    await userEvent.click(checkbox)
    expect(onToggle).toHaveBeenCalledWith("codex")
  })

  it("does not open provider details when toggling a provider checkbox", async () => {
    const onSelectedProviderChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        settingsTab="providers"
        onSettingsTabChange={vi.fn()}
        selectedProviderId="opencode"
        onSelectedProviderChange={onSelectedProviderChange}
      />
    )

    await userEvent.click(screen.getByRole("checkbox", { name: "Enable Codex" }))

    expect(onSelectedProviderChange).not.toHaveBeenCalled()
  })

  it("moves settings radio focus with arrow keys", async () => {
    render(<TestHarness />)

    const current = screen.getByRole("radio", { name: "15 min" })
    const next = screen.getByRole("radio", { name: "30 min" })

    current.focus()
    await userEvent.keyboard("{ArrowRight}")

    expect(next).toHaveFocus()
  })

  it("does not select the first provider when opening the Providers tab", () => {
    const onSelectedProviderChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        settingsTab="providers"
        onSettingsTabChange={vi.fn()}
        selectedProviderId={null}
        onSelectedProviderChange={onSelectedProviderChange}
      />
    )

    expect(onSelectedProviderChange).not.toHaveBeenCalled()
  })

  it("updates auto-update interval on the General tab", async () => {
    const onAutoUpdateIntervalChange = vi.fn()
    render(<TestHarness onAutoUpdateIntervalChange={onAutoUpdateIntervalChange} />)
    await userEvent.click(screen.getByText("30 min"))
    expect(onAutoUpdateIntervalChange).toHaveBeenCalledWith(30)
  })
})
