import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AboutDialog } from "@/components/about-dialog"
import { APP_NAME, PROJECT_REPO_URL } from "@/lib/project-metadata"

const changelogState = vi.hoisted(() => ({
  releases: [] as import("@/hooks/use-changelog").Release[],
  loading: false,
  error: null as string | null,
}))

const openerState = vi.hoisted(() => ({
  openUrlMock: vi.fn(() => Promise.resolve()),
}))

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openerState.openUrlMock,
}))

vi.mock("@/hooks/use-changelog", () => ({
  useChangelog: () => changelogState,
}))

describe("AboutDialog", () => {
  it("renders version, fork lineage, author, and links", () => {
    render(<AboutDialog version="1.2.3" onClose={() => {}} />)
    expect(screen.getByText(APP_NAME)).toBeInTheDocument()
    expect(screen.getByText("v1.2.3")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "OpenUsage" })).toBeInTheDocument()
    expect(screen.getByText(/redirected toward a Windows-native desktop experience/i)).toBeInTheDocument()
    expect(screen.getByText("By")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Luis Leineweber" })).toBeInTheDocument()
    expect(screen.getByText("GitHub")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "View Changelog" })).toBeInTheDocument()
    expect(screen.getByText(/Original OpenUsage by/i)).toBeInTheDocument()
  })

  it("opens the author GitHub profile on click", async () => {
    render(<AboutDialog version="1.2.3" onClose={() => {}} />)

    await userEvent.click(screen.getByRole("button", { name: "Luis Leineweber" }))
    expect(openerState.openUrlMock).toHaveBeenCalledWith("https://github.com/Loues000")
  })

  it("closes on Escape", async () => {
    const onClose = vi.fn()
    render(<AboutDialog version="1.2.3" onClose={onClose} />)
    await userEvent.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalled()
  })

  it("goes back to about view on Escape when showing changelog", async () => {
    const onClose = vi.fn()
    render(<AboutDialog version="1.2.3" onClose={onClose} />)

    await userEvent.click(screen.getByRole("button", { name: "View Changelog" }))
    await userEvent.keyboard("{Escape}")

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText(APP_NAME)).toBeInTheDocument()
  })

  it("does not close on other keys", async () => {
    const onClose = vi.fn()
    render(<AboutDialog version="1.2.3" onClose={onClose} />)
    await userEvent.keyboard("{Enter}")
    expect(onClose).not.toHaveBeenCalled()
  })

  it("closes on backdrop click only", async () => {
    const onClose = vi.fn()
    const { container } = render(<AboutDialog version="1.2.3" onClose={onClose} />)
    const backdrop = container.firstElementChild as HTMLElement
    await userEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)

    // Clicking inside the dialog should not close.
    onClose.mockClear()
    await userEvent.click(screen.getByText(APP_NAME))
    expect(onClose).not.toHaveBeenCalled()
  })

  it("calls openUrl and logs errors on failure", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    openerState.openUrlMock.mockImplementationOnce(() => Promise.reject(new Error("fail")))

    render(<AboutDialog version="1.2.3" onClose={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "GitHub" }))

    expect(openerState.openUrlMock).toHaveBeenCalled()
    // wait microtask for catch
    await Promise.resolve()
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it("closes when document becomes hidden", () => {
    const onClose = vi.fn()
    render(<AboutDialog version="1.2.3" onClose={onClose} />)

    const original = Object.getOwnPropertyDescriptor(document, "hidden")
    Object.defineProperty(document, "hidden", { value: true, configurable: true })
    document.dispatchEvent(new Event("visibilitychange"))
    expect(onClose).toHaveBeenCalled()

    if (original) {
      Object.defineProperty(document, "hidden", original)
    }
  })

  it("does not close on visibilitychange when document is visible", () => {
    const onClose = vi.fn()
    render(<AboutDialog version="1.2.3" onClose={onClose} />)

    const original = Object.getOwnPropertyDescriptor(document, "hidden")
    Object.defineProperty(document, "hidden", { value: false, configurable: true })
    document.dispatchEvent(new Event("visibilitychange"))
    expect(onClose).not.toHaveBeenCalled()

    if (original) {
      Object.defineProperty(document, "hidden", original)
    }
  })

  it("uses the fork repository link", async () => {
    render(<AboutDialog version="1.2.3" onClose={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "GitHub" }))
    expect(openerState.openUrlMock).toHaveBeenCalledWith(PROJECT_REPO_URL)
  })

  it("opens the upstream OpenUsage repository from the lineage text", async () => {
    render(<AboutDialog version="1.2.3" onClose={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "OpenUsage" }))
    expect(openerState.openUrlMock).toHaveBeenCalledWith("https://github.com/robinebers/openusage")
  })
})

