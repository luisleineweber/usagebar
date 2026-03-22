import { cleanup, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { useState } from "react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

let latestOnDragEnd: ((event: any) => void) | undefined

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd }: { children: ReactNode; onDragEnd?: (event: any) => void }) => {
    latestOnDragEnd = onDragEnd
    return <div data-testid="dnd-context">{children}</div>
  },
  closestCenter: vi.fn(),
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: vi.fn((_sensor: any, options?: any) => ({ sensor: _sensor, options })),
  useSensors: vi.fn((...sensors: any[]) => sensors),
}))

vi.mock("@dnd-kit/sortable", () => ({
  arrayMove: (items: any[], from: number, to: number) => {
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
  },
  SortableContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: vi.fn(),
}))

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}))

import { SettingsPage } from "@/pages/settings"
import type { SettingsPluginState } from "@/hooks/app/use-settings-plugin-list"

const providers: SettingsPluginState[] = [
  {
    id: "opencode",
    name: "OpenCode",
    iconUrl: "/opencode.svg",
    brandColor: "#16a34a",
    enabled: true,
    supported: true,
    supportState: "experimental",
    supportMessage: "Experimental on Windows.",
    meta: {
      id: "opencode",
      name: "OpenCode",
      iconUrl: "/opencode.svg",
      brandColor: "#16a34a",
      supportState: "experimental",
      supportMessage: "Experimental on Windows.",
      lines: [],
      primaryCandidates: [],
    },
    state: { data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null },
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
    state: { data: null, loading: false, error: "Not signed in", lastManualRefreshAt: null, lastSuccessAt: null },
  },
]

const defaultProps = {
  providers,
  onReorder: vi.fn(),
  onToggle: vi.fn(),
  autoUpdateInterval: 15 as const,
  onAutoUpdateIntervalChange: vi.fn(),
  themeMode: "system" as const,
  onThemeModeChange: vi.fn(),
  displayMode: "used" as const,
  onDisplayModeChange: vi.fn(),
  resetTimerDisplayMode: "relative" as const,
  onResetTimerDisplayModeChange: vi.fn(),
  menubarIconStyle: "provider" as const,
  onMenubarIconStyleChange: vi.fn(),
  traySettingsPreview: {
    bars: [{ id: "a", fraction: 0.7 }],
    providerBars: [{ id: "a", fraction: 0.7 }],
    providerIconUrl: "icon-a",
    providerPercentText: "70%",
  },
  globalShortcut: null,
  onGlobalShortcutChange: vi.fn(),
  startOnLogin: false,
  onStartOnLoginChange: vi.fn(),
  onProviderConfigChange: vi.fn(async () => undefined),
  onProviderSecretSave: vi.fn(async () => undefined),
  onProviderSecretDelete: vi.fn(async () => undefined),
  onRetryProvider: vi.fn(),
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
  it("renders General and Providers tabs", () => {
    render(<TestHarness />)
    expect(screen.getByRole("tab", { name: "General" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Providers" })).toBeInTheDocument()
  })

  it("uses responsive layout classes for narrow settings widths", () => {
    const { container } = render(<TestHarness />)

    expect(container.querySelector(".md\\:flex-row")).toBeTruthy()
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
    expect(screen.getByText("Menubar Icon")).toBeInTheDocument()
    expect(screen.queryByText("Reorder your lineup and select a provider to manage.")).not.toBeInTheDocument()
  })

  it("switches to the Providers tab and shows provider detail", async () => {
    render(<TestHarness />)
    await userEvent.click(screen.getByRole("tab", { name: "Providers" }))

    expect(screen.getByText("Reorder your lineup and select a provider to manage.")).toBeInTheDocument()
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

  it("keeps provider selection local to the Settings window", async () => {
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

    expect(onSelectedProviderChange.mock.calls).toContainEqual(["codex", { revealInTray: true }])
  })

  it("reorders providers from the Providers tab", async () => {
    const onReorder = vi.fn()
    render(<TestHarness onReorder={onReorder} />)
    await userEvent.click(screen.getByRole("tab", { name: "Providers" }))

    latestOnDragEnd?.({ active: { id: "opencode" }, over: { id: "codex" } })
    expect(onReorder).toHaveBeenCalledWith(["codex", "opencode"])
  })

  it("toggles providers from the Providers tab", async () => {
    const onToggle = vi.fn()
    render(<TestHarness onToggle={onToggle} />)
    await userEvent.click(screen.getByRole("tab", { name: "Providers" }))

    const codexRow = screen.getByRole("button", { name: /codex/i })
    const checkbox = within(codexRow).getByRole("checkbox")
    await userEvent.click(checkbox)
    expect(onToggle).toHaveBeenCalledWith("codex")
  })

  it("updates auto-update interval on the General tab", async () => {
    const onAutoUpdateIntervalChange = vi.fn()
    render(<TestHarness onAutoUpdateIntervalChange={onAutoUpdateIntervalChange} />)
    await userEvent.click(screen.getByText("30 min"))
    expect(onAutoUpdateIntervalChange).toHaveBeenCalledWith(30)
  })
})
