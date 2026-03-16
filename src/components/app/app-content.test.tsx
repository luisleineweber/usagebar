import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { overviewPageMock, providerDetailPageMock, openSettingsWindowMock } = vi.hoisted(() => ({
  overviewPageMock: vi.fn(),
  providerDetailPageMock: vi.fn(),
  openSettingsWindowMock: vi.fn(),
}))

vi.mock("@/pages/overview", () => ({
  OverviewPage: (props: unknown) => {
    overviewPageMock(props)
    return <div data-testid="overview-page" />
  },
}))

vi.mock("@/pages/provider-detail", () => ({
  ProviderDetailPage: (props: { onRetry?: () => void; onOpenProviderSettings?: (providerId: string) => void }) => {
    providerDetailPageMock(props)
    return (
      <div data-testid="provider-detail-page">
        {props.onRetry ? <button onClick={props.onRetry}>retry-provider</button> : null}
        {props.onOpenProviderSettings ? (
          <button onClick={() => props.onOpenProviderSettings?.("codex")}>open-provider-settings</button>
        ) : null}
      </div>
    )
  },
}))

vi.mock("@/lib/settings-window", () => ({
  openSettingsWindow: openSettingsWindowMock,
}))

import { AppContent, type AppContentProps } from "@/components/app/app-content"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"

function createProps(): AppContentProps {
  return {
    displayPlugins: [],
    selectedPlugin: {
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
      lastSuccessAt: null,
    },
    onRetryPlugin: vi.fn(),
    onReorder: vi.fn(),
    onToggle: vi.fn(),
    onProviderConfigChange: vi.fn(async () => undefined),
    onProviderSecretSave: vi.fn(async () => undefined),
    onProviderSecretDelete: vi.fn(async () => undefined),
    onAutoUpdateIntervalChange: vi.fn(),
    onThemeModeChange: vi.fn(),
    onDisplayModeChange: vi.fn(),
    onResetTimerDisplayModeChange: vi.fn(),
    onResetTimerDisplayModeToggle: vi.fn(),
    onMenubarIconStyleChange: vi.fn(),
    traySettingsPreview: {
      bars: [],
      providerBars: [],
      providerIconUrl: "",
      providerPercentText: "--%",
    },
    onGlobalShortcutChange: vi.fn(),
    onStartOnLoginChange: vi.fn(),
  }
}

describe("AppContent", () => {
  beforeEach(() => {
    overviewPageMock.mockReset()
    providerDetailPageMock.mockReset()
    openSettingsWindowMock.mockReset()
    openSettingsWindowMock.mockResolvedValue(undefined)
    useAppUiStore.getState().resetState()
    useAppPreferencesStore.getState().resetState()
  })

  it("renders overview page for home view", () => {
    useAppUiStore.getState().setActiveView("home")
    render(<AppContent {...createProps()} />)

    expect(screen.getByTestId("overview-page")).toBeInTheDocument()
    expect(overviewPageMock).toHaveBeenCalledTimes(1)
  })

  it("passes retry callback for provider detail view", () => {
    const props = createProps()
    useAppUiStore.getState().setActiveView("codex")
    render(<AppContent {...props} />)

    fireEvent.click(screen.getByRole("button", { name: "retry-provider" }))

    expect(providerDetailPageMock).toHaveBeenCalledTimes(1)
    expect(props.onRetryPlugin).toHaveBeenCalledWith("codex")
  })

  it("opens the standalone settings window from provider detail", () => {
    useAppUiStore.getState().setActiveView("codex")
    render(<AppContent {...createProps()} />)

    fireEvent.click(screen.getByRole("button", { name: "open-provider-settings" }))

    expect(openSettingsWindowMock).toHaveBeenCalledWith({ tab: "providers", providerId: "codex" })
  })
})
