import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { PanelFooter } from "@/components/panel-footer"
import type { UpdateStatus } from "@/hooks/use-app-update"
import type { DataFreshness } from "@/lib/data-freshness"
import { APP_NAME } from "@/lib/project-metadata"

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(() => Promise.resolve()),
}))

const idle: UpdateStatus = { status: "idle" }
const noop = () => {}
const footerProps = { showAbout: false, onShowAbout: noop, onCloseAbout: noop, onUpdateCheck: noop }
const never: DataFreshness = { kind: "never" }

describe("PanelFooter", () => {
  it("shows countdown in minutes when >= 60 seconds", () => {
    const futureTime = Date.now() + 5 * 60 * 1000 // 5 minutes from now
    render(
      <PanelFooter
        version="0.0.0"
        freshness={never}
        autoUpdateNextAt={futureTime}
        updateStatus={idle}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )
    expect(screen.getByText("5m")).toBeTruthy()
  })

  it("shows countdown in seconds when < 60 seconds", () => {
    const futureTime = Date.now() + 30 * 1000 // 30 seconds from now
    render(
      <PanelFooter
        version="0.0.0"
        freshness={never}
        autoUpdateNextAt={futureTime}
        updateStatus={idle}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )
    expect(screen.getByText("30s")).toBeTruthy()
  })

  it("triggers refresh when clicking countdown label", async () => {
    const futureTime = Date.now() + 5 * 60 * 1000 // 5 minutes from now
    const onRefreshAll = vi.fn()
    render(
      <PanelFooter
        version="0.0.0"
        freshness={never}
        autoUpdateNextAt={futureTime}
        updateStatus={idle}
        onUpdateInstall={noop}
        onRefreshAll={onRefreshAll}
        {...footerProps}
      />
    )
    const button = screen.getByRole("button", { name: /Next automatic refresh in/i })
    await userEvent.click(button)
    expect(onRefreshAll).toHaveBeenCalledTimes(1)
  })

  it("shows Paused when autoUpdateNextAt is null", () => {
    render(
      <PanelFooter
        version="0.0.0"
        freshness={never}
        autoUpdateNextAt={null}
        updateStatus={idle}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )
    expect(screen.getByText("Paused")).toBeTruthy()
  })

  it("shows the displayed data update time", () => {
    vi.useFakeTimers()
    const now = new Date("2026-07-16T12:00:00.000Z")
    vi.setSystemTime(now)

    render(
      <PanelFooter
        version="0.0.0"
        freshness={{ kind: "fresh", lastSuccessAt: now.getTime() - 2 * 60 * 1000 }}
        autoUpdateNextAt={null}
        updateStatus={idle}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    expect(screen.getByText("Data updated 2m ago")).toBeInTheDocument()
    vi.useRealTimers()
  })

  it("shows a refresh failure instead of a success time when providers failed", () => {
    vi.useFakeTimers()
    const now = new Date("2026-07-16T12:00:00.000Z")
    vi.setSystemTime(now)

    render(
      <PanelFooter
        version="0.0.0"
        freshness={{ kind: "failed", failedCount: 2, totalCount: 3, lastSuccessAt: now.getTime() }}
        autoUpdateNextAt={null}
        updateStatus={idle}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    const status = screen.getByRole("status")
    expect(status).toHaveTextContent("2 of 3 failed")
    expect(status).toHaveAttribute(
      "title",
      "Refresh failed for 2 of 3 providers. Data updated just now."
    )
    expect(screen.queryByText(/Data updated just now/)).toBeNull()
    vi.useRealTimers()
  })

  it("shows a refreshing state instead of a success time while providers load", () => {
    render(
      <PanelFooter
        version="0.0.0"
        freshness={{ kind: "refreshing" }}
        autoUpdateNextAt={null}
        updateStatus={idle}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    expect(screen.getByRole("status")).toHaveTextContent("Refreshing...")
    expect(screen.queryByText(/Data updated/)).toBeNull()
  })

  it("puts actionable app updates on their own row, apart from data freshness", () => {
    for (const updateStatus of [
      { status: "available", version: "0.2.0-beta.12" },
      { status: "ready" },
    ] satisfies UpdateStatus[]) {
      const { container, unmount } = render(
        <PanelFooter
          version="0.0.0"
          freshness={{ kind: "fresh", lastSuccessAt: Date.now() - 12 * 60_000 }}
          autoUpdateNextAt={null}
          updateStatus={updateStatus}
          onUpdateInstall={noop}
          {...footerProps}
        />
      )
      const actionRow = container.querySelector('[data-slot="app-update-action"]')
      const action = within(actionRow as HTMLElement).getByRole("button")
      expect(action).toHaveClass("shrink")
      expect(action).not.toHaveClass("shrink-0")
      expect(actionRow).not.toContainElement(screen.getByText("Data updated 12m ago"))
      expect(actionRow).not.toContainElement(screen.getByRole("button", { name: "UsageBar 0.0.0" }))
      unmount()
    }
  })

  it("keeps the version button reachable in every app update state", async () => {
    const states: UpdateStatus[] = [
      { status: "checking" },
      { status: "up-to-date" },
      { status: "available", version: "0.2.0" },
      { status: "downloading", progress: 10 },
      { status: "ready" },
      { status: "installing" },
      { status: "unavailable", message: "Updates unavailable in development" },
      { status: "error", message: "Update check failed" },
      { status: "error", message: "Download failed" },
    ]
    for (const updateStatus of states) {
      const onShowAbout = vi.fn()
      const { unmount } = render(
        <PanelFooter
          version="0.0.0"
          freshness={never}
          autoUpdateNextAt={null}
          updateStatus={updateStatus}
          onUpdateInstall={noop}
          {...footerProps}
          onShowAbout={onShowAbout}
        />
      )
      await userEvent.click(screen.getByRole("button", { name: `${APP_NAME} 0.0.0` }))
      expect(onShowAbout).toHaveBeenCalledTimes(1)
      unmount()
    }
  })

  it("shows a readable alpha label instead of raw semver in idle state", async () => {
    const onUpdateCheck = vi.fn()
    render(
      <PanelFooter
        version="0.1.0-alpha.1"
        freshness={never}
        autoUpdateNextAt={null}
        updateStatus={idle}
        onUpdateInstall={noop}
        showAbout={false}
        onShowAbout={noop}
        onCloseAbout={noop}
        onUpdateCheck={onUpdateCheck}
      />
    )
    const button = screen.getByRole("button", { name: "UsageBar Alpha 1" })
    expect(button).toHaveAttribute(
      "title",
      "UsageBar 0.1.0-alpha.1. Right-click to check for app updates."
    )

    fireEvent.contextMenu(button)
    expect(onUpdateCheck).toHaveBeenCalledTimes(1)
  })

  it("keeps the version context menu from reaching the panel context menu", () => {
    const onUpdateCheck = vi.fn()
    const onPanelContextMenu = vi.fn()
    render(
      <div onContextMenu={onPanelContextMenu}>
        <PanelFooter
          version="0.1.0-alpha.1"
          freshness={never}
          autoUpdateNextAt={null}
          updateStatus={idle}
          onUpdateInstall={noop}
          showAbout={false}
          onShowAbout={noop}
          onCloseAbout={noop}
          onUpdateCheck={onUpdateCheck}
        />
      </div>
    )

    fireEvent.contextMenu(screen.getByRole("button", { name: "UsageBar Alpha 1" }))

    expect(onUpdateCheck).toHaveBeenCalledTimes(1)
    expect(onPanelContextMenu).not.toHaveBeenCalled()
  })

  it("shows downloading state", () => {
    render(
      <PanelFooter
        version="0.0.0"
        freshness={never}
        autoUpdateNextAt={null}
        updateStatus={{ status: "downloading", progress: 42 }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )
    expect(screen.getByRole("status")).toHaveTextContent("Downloading app update 42%")
  })

  it("shows visible feedback while checking for updates", () => {
    render(
      <PanelFooter
        version="0.0.0"
        freshness={never}
        autoUpdateNextAt={null}
        updateStatus={{ status: "checking" }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    expect(screen.getByRole("status")).toHaveTextContent("Checking for app update...")
  })

  it("shows when the app is up to date", () => {
    render(
      <PanelFooter
        version="0.0.0"
        freshness={never}
        autoUpdateNextAt={null}
        updateStatus={{ status: "up-to-date" }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    expect(screen.getByRole("status")).toHaveTextContent("App up to date")
  })

  it("shows downloading state without percentage when progress is unknown", () => {
    render(
      <PanelFooter
        version="0.0.0"
        freshness={never}
        autoUpdateNextAt={null}
        updateStatus={{ status: "downloading", progress: -1 }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )
    expect(screen.getByRole("status")).toHaveTextContent("Downloading app update...")
  })

  it("shows explicit update action when an update is available", async () => {
    const onInstall = vi.fn()
    render(
      <PanelFooter
        version="0.0.0"
        freshness={never}
        autoUpdateNextAt={null}
        updateStatus={{ status: "available", version: "0.1.0-beta.7" }}
        onUpdateInstall={onInstall}
        {...footerProps}
      />
    )
    const button = screen.getByRole("button", { name: "Update to 0.1.0-beta.7" })
    expect(button).toHaveAttribute("title", "Download app update")
    expect(button).toHaveClass("rounded-md", "border-primary/20", "dark:bg-page-accent/10")
    await userEvent.click(button)
    expect(onInstall).toHaveBeenCalledTimes(1)
  })

  it("keeps a failed download available for retry", () => {
    render(
      <PanelFooter
        version="0.0.0"
        freshness={never}
        autoUpdateNextAt={null}
        updateStatus={{ status: "available", version: "0.1.0-beta.7", error: "Download failed" }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    expect(screen.getByRole("button", { name: "Update to 0.1.0-beta.7" })).toHaveAttribute(
      "title",
      "Download failed. Try again."
    )
  })

  it("shows restart button when ready", async () => {
    const onInstall = vi.fn()
    render(
      <PanelFooter
        version="0.0.0"
        freshness={never}
        autoUpdateNextAt={null}
        updateStatus={{ status: "ready" }}
        onUpdateInstall={onInstall}
        {...footerProps}
      />
    )
    const button = screen.getByText("Restart to update")
    expect(button).toBeTruthy()
    await userEvent.click(button)
    expect(onInstall).toHaveBeenCalledTimes(1)
  })

  it("keeps version dialog on left-click and update check on right-click after check failures", async () => {
    const onUpdateCheck = vi.fn()
    const onShowAbout = vi.fn()
    render(
      <PanelFooter
        version="0.1.0-alpha.4"
        freshness={never}
        autoUpdateNextAt={null}
        updateStatus={{ status: "error", message: "Update check failed" }}
        onUpdateInstall={noop}
        showAbout={false}
        onShowAbout={onShowAbout}
        onCloseAbout={noop}
        onUpdateCheck={onUpdateCheck}
      />
    )

    const versionButton = screen.getByRole("button", { name: "UsageBar Alpha 4" })
    expect(screen.getByRole("alert")).toHaveTextContent("App update check failed")
    expect(screen.queryByRole("button", { name: "Updates soon" })).toBeNull()

    await userEvent.click(versionButton)
    expect(onShowAbout).toHaveBeenCalledTimes(1)
    expect(onUpdateCheck).not.toHaveBeenCalled()

    fireEvent.contextMenu(versionButton)
    expect(onUpdateCheck).toHaveBeenCalledTimes(1)
  })

  it("shows error state for non-check failures", () => {
    render(
      <PanelFooter
        version="0.0.0"
        freshness={never}
        autoUpdateNextAt={null}
        updateStatus={{ status: "error", message: "Download failed" }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )
    expect(screen.getByRole("alert")).toHaveTextContent("App update failed")
    expect(screen.queryByRole("button", { name: "Updates soon" })).toBeNull()
  })

  it("shows installing state", () => {
    render(
      <PanelFooter
        version="0.0.0"
        freshness={never}
        autoUpdateNextAt={null}
        updateStatus={{ status: "installing" }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )
    expect(screen.getByRole("status")).toHaveTextContent("Installing app update...")
  })

  it("shows when update checks are unavailable", () => {
    render(
      <PanelFooter
        version="0.0.0"
        freshness={never}
        autoUpdateNextAt={null}
        updateStatus={{ status: "unavailable", message: "Updates unavailable in development" }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    expect(screen.getByText("App updates unavailable")).toHaveAttribute(
      "title",
      "Updates unavailable in development"
    )
  })

  it("opens About dialog when clicking version in idle state", async () => {
    function Harness() {
      const [showAbout, setShowAbout] = useState(false)
      return (
        <PanelFooter
          version="0.0.0"
          freshness={never}
          autoUpdateNextAt={null}
          updateStatus={idle}
          onUpdateInstall={noop}
          showAbout={showAbout}
          onShowAbout={() => setShowAbout(true)}
          onCloseAbout={() => setShowAbout(false)}
          onUpdateCheck={noop}
        />
      )
    }

    render(<Harness />)
    await userEvent.click(screen.getByRole("button", { name: new RegExp(APP_NAME, "i") }))
    expect(screen.getByText("Open source on")).toBeInTheDocument()

    // Close via Escape to exercise AboutDialog onClose path.
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByText("Open source on")).not.toBeInTheDocument()
  })
})
