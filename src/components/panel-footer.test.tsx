import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { PanelFooter } from "@/components/panel-footer"
import type { UpdateStatus } from "@/hooks/use-app-update"
import { APP_NAME } from "@/lib/project-metadata"

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(() => Promise.resolve()),
}))

const idle: UpdateStatus = { status: "idle" }
const noop = () => {}
const footerProps = { showAbout: false, onShowAbout: noop, onCloseAbout: noop, onUpdateCheck: noop }

describe("PanelFooter", () => {
  it("shows countdown in minutes when >= 60 seconds", () => {
    const futureTime = Date.now() + 5 * 60 * 1000 // 5 minutes from now
    render(
      <PanelFooter
        version="0.0.0"
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
        autoUpdateNextAt={futureTime}
        updateStatus={idle}
        onUpdateInstall={noop}
        onRefreshAll={onRefreshAll}
        {...footerProps}
      />
    )
    const button = screen.getByRole("button", { name: /Next automatic update in/i })
    await userEvent.click(button)
    expect(onRefreshAll).toHaveBeenCalledTimes(1)
  })

  it("shows Paused when autoUpdateNextAt is null", () => {
    render(
      <PanelFooter
        version="0.0.0"
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
        lastUpdatedAt={now.getTime() - 2 * 60 * 1000}
        autoUpdateNextAt={null}
        updateStatus={idle}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    expect(screen.getByText("Updated 2m ago")).toBeInTheDocument()
    vi.useRealTimers()
  })

  it("shows a readable alpha label instead of raw semver in idle state", async () => {
    const onUpdateCheck = vi.fn()
    render(
      <PanelFooter
        version="0.1.0-alpha.1"
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
      "UsageBar 0.1.0-alpha.1. Right-click to check for updates."
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
        autoUpdateNextAt={null}
        updateStatus={{ status: "downloading", progress: 42 }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )
    expect(screen.getByText("Downloading update 42%")).toBeTruthy()
  })

  it("shows visible feedback while checking for updates", () => {
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={{ status: "checking" }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    expect(screen.getByText("Checking for updates...")).toBeInTheDocument()
  })

  it("shows when the app is up to date", () => {
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={{ status: "up-to-date" }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    expect(screen.getByText("Up to date")).toBeInTheDocument()
  })

  it("shows downloading state without percentage when progress is unknown", () => {
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={{ status: "downloading", progress: -1 }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )
    expect(screen.getByText("Downloading update...")).toBeTruthy()
  })

  it("shows explicit update action when an update is available", async () => {
    const onInstall = vi.fn()
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={{ status: "available", version: "0.1.0-beta.7" }}
        onUpdateInstall={onInstall}
        {...footerProps}
      />
    )
    const button = screen.getByRole("button", { name: "Update to 0.1.0-beta.7" })
    expect(button).toHaveAttribute("title", "Download and install update")
    expect(button).toHaveClass("rounded-[10px]", "bg-emerald-500")
    await userEvent.click(button)
    expect(onInstall).toHaveBeenCalledTimes(1)
  })

  it("shows restart button when ready", async () => {
    const onInstall = vi.fn()
    render(
      <PanelFooter
        version="0.0.0"
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
        autoUpdateNextAt={null}
        updateStatus={{ status: "error", message: "Update check failed" }}
        onUpdateInstall={noop}
        showAbout={false}
        onShowAbout={onShowAbout}
        onCloseAbout={noop}
        onUpdateCheck={onUpdateCheck}
      />
    )

    const versionButton = screen.getByRole("button", { name: "Update check failed" })
    expect(versionButton).toHaveAttribute("title", "Update check failed. Right-click to try again.")
    expect(screen.queryByRole("button", { name: "Updates soon" })).toBeNull()

    await userEvent.click(versionButton)
    expect(onShowAbout).toHaveBeenCalledTimes(1)
    expect(onUpdateCheck).not.toHaveBeenCalled()

    fireEvent.contextMenu(versionButton)
    expect(onUpdateCheck).toHaveBeenCalledTimes(1)
  })

  it("shows error state for non-check failures", () => {
    const { container } = render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={{ status: "error", message: "Download failed" }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )
    expect(container.textContent).toContain("Update failed")
    expect(screen.queryByRole("button", { name: "Updates soon" })).toBeNull()
  })

  it("shows installing state", () => {
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={{ status: "installing" }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )
    expect(screen.getByText("Installing...")).toBeTruthy()
  })

  it("shows when update checks are unavailable", () => {
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={{ status: "unavailable", message: "Updates unavailable in development" }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    expect(screen.getByText("Updates unavailable")).toHaveAttribute(
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
