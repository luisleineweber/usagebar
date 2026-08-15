import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { MouseEvent } from "react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type MockComponentProps = { children?: ReactNode }

const { appContentMock, invokeMock, openSettingsWindowMock, panelFooterMock, sideNavMock } =
  vi.hoisted(() => ({
    appContentMock: vi.fn(),
    invokeMock: vi.fn(),
    openSettingsWindowMock: vi.fn(),
    panelFooterMock: vi.fn(),
    sideNavMock: vi.fn(),
  }))

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))
vi.mock("@/lib/settings-window", () => ({ openSettingsWindow: openSettingsWindowMock }))
vi.mock("@/hooks/app/use-app-version", () => ({ useAppVersion: () => "1.2.3" }))
vi.mock("@/hooks/use-app-update", () => ({
  useAppUpdate: () => ({
    updateStatus: { kind: "idle" },
    triggerInstall: vi.fn(),
    checkForUpdates: vi.fn(),
  }),
}))
vi.mock("@/hooks/app/use-panel", () => ({
  panelPreferredMinHeightForView: vi.fn(() => 240),
  usePanel: () => ({
    containerRef: { current: null },
    contentColumnRef: { current: null },
    scrollRef: { current: null },
    contentMeasureRef: { current: null },
    footerRef: { current: null },
    canScrollDown: true,
    panelHeightPx: 500,
    maxPanelHeightPx: 600,
    isPanelResizing: false,
  }),
}))
vi.mock("@/components/side-nav", () => ({
  SideNav: (props: {
    onOpenSettings: () => void
    onOpenContextMenu: (event: MouseEvent, pluginId?: string) => void
  }) => {
    sideNavMock(props)
    return (
      <nav>
        <button onClick={props.onOpenSettings}>open-settings</button>
        <button onContextMenu={(event) => props.onOpenContextMenu(event, "codex")}>
          codex-context
        </button>
      </nav>
    )
  },
}))
vi.mock("@/components/app/app-content", () => ({
  AppContent: (props: { onOpenProviderSettings: (providerId: string) => void }) => {
    appContentMock(props)
    return <button onClick={() => props.onOpenProviderSettings("codex")}>provider-setup</button>
  },
}))
vi.mock("@/components/panel-footer", () => ({
  PanelFooter: (props: MockComponentProps) => {
    panelFooterMock(props)
    return <footer>footer</footer>
  },
}))

import type { AppContentActionProps } from "@/components/app/app-content"
import { AppShell } from "@/components/app/app-shell"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import { useAppUiStore } from "@/stores/app-ui-store"

const plugin = {
  meta: {
    id: "codex",
    name: "Codex",
    iconUrl: "/codex.svg",
    brandColor: "#000000",
    lines: [],
    primaryCandidates: [],
  },
  data: null,
  loading: false,
  error: null,
  lastManualRefreshAt: null,
  lastSuccessAt: 20,
} as DisplayPluginState

function renderShell(
  overrides: Partial<{ showHistoryInBar: boolean; hasResolvedViews: boolean }> = {}
) {
  const props = {
    onRefreshAll: vi.fn(),
    navPlugins: [{ id: "codex", name: "Codex", iconUrl: "/codex.svg" }],
    displayPlugins: [
      plugin,
      { ...plugin, meta: { ...plugin.meta, id: "claude" }, lastSuccessAt: 10 },
    ],
    autoUpdateNextAt: null,
    selectedPlugin: plugin,
    resolvedSelectedPlugin: plugin,
    hasResolvedViews: true,
    onPluginContextAction: vi.fn(),
    isPluginRefreshAvailable: vi.fn(() => true),
    onNavReorder: vi.fn(),
    appContentProps: {} as AppContentActionProps,
    showHistoryInBar: false,
    ...overrides,
  }
  render(<AppShell {...props} />)
  return props
}

function openPanelMenu() {
  fireEvent.contextMenu(screen.getByTestId("app-panel"), { clientX: 20, clientY: 20 })
  return screen.getByRole("menu", { name: "UsageBar context menu" })
}

describe("AppShell", () => {
  beforeEach(() => {
    useAppUiStore.getState().resetState()
    useAppUiStore.getState().setActiveView("codex")
    invokeMock.mockResolvedValue(undefined)
    openSettingsWindowMock.mockResolvedValue(undefined)
  })

  it("renders panel dimensions and passes the oldest successful update to the footer", () => {
    renderShell()

    expect(screen.getByTestId("app-panel")).toHaveStyle({ height: "500px", maxHeight: "600px" })
    expect(panelFooterMock).toHaveBeenCalledWith(expect.objectContaining({ lastUpdatedAt: 10 }))
    expect(appContentMock).toHaveBeenCalledWith(
      expect.objectContaining({ selectedPlugin: plugin, resolvedSelectedPlugin: plugin })
    )
  })

  it("runs provider context actions by accessible menu name", () => {
    const props = renderShell()

    openPanelMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Refresh provider" }))
    expect(props.onPluginContextAction).toHaveBeenCalledWith("codex", "reload")

    openPanelMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Arrange providers" }))
    expect(props.onPluginContextAction).toHaveBeenCalledWith("codex", "arrange")

    openPanelMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Hide provider" }))
    expect(props.onPluginContextAction).toHaveBeenCalledWith("codex", "remove")
  })

  it("refreshes all providers from the context menu", () => {
    const props = renderShell()

    openPanelMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Refresh all providers" }))

    expect(props.onRefreshAll).toHaveBeenCalledOnce()
  })

  it("opens general and provider settings from each public action", async () => {
    renderShell()

    fireEvent.click(screen.getByRole("button", { name: "open-settings" }))
    await waitFor(() => expect(openSettingsWindowMock).toHaveBeenCalledWith({ tab: "general" }))

    fireEvent.click(screen.getByRole("button", { name: "provider-setup" }))
    await waitFor(() =>
      expect(openSettingsWindowMock).toHaveBeenCalledWith({ tab: "providers", providerId: "codex" })
    )

    openPanelMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Provider settings" }))
    expect(openSettingsWindowMock).toHaveBeenLastCalledWith({
      tab: "providers",
      providerId: "codex",
    })

    openPanelMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }))
    expect(openSettingsWindowMock).toHaveBeenLastCalledWith({ tab: "general" })
  })

  it("closes the context menu with Escape or an outside pointer event", async () => {
    renderShell()

    openPanelMenu()
    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()

    openPanelMenu()
    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument())
  })

  it("hides the native panel from the Close action and reports failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    invokeMock.mockRejectedValue(new Error("native failure"))
    renderShell()

    openPanelMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Close" }))

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("hide_panel"))
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith("Failed to hide panel:", expect.any(Error))
    )
  })
})
