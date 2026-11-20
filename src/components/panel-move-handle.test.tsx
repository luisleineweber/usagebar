import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  nudgePanel: vi.fn(),
  returnPanelToTray: vi.fn(),
  startPanelDrag: vi.fn(),
}))

vi.mock("@/lib/panel-placement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/panel-placement")>()),
  nudgePanel: mocks.nudgePanel,
  returnPanelToTray: mocks.returnPanelToTray,
  startPanelDrag: mocks.startPanelDrag,
}))

import { PanelMoveHandle } from "@/components/panel-move-handle"

describe("PanelMoveHandle", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset()
      mock.mockResolvedValue({ movable: true, floating: false })
    }
  })

  it("renders nothing while the placement is unknown or the panel is anchored only", () => {
    const { rerender } = render(<PanelMoveHandle placement={null} />)
    expect(screen.queryByTestId("panel-move-strip")).toBeNull()

    rerender(<PanelMoveHandle placement={{ movable: false, floating: false }} />)
    expect(screen.queryByTestId("panel-move-strip")).toBeNull()
  })

  it("shows a labelled grip with a keyboard hint when movable", () => {
    render(<PanelMoveHandle placement={{ movable: true, floating: false }} />)

    const grip = screen.getByRole("button", { name: "Move panel" })
    expect(grip).toHaveAccessibleDescription(
      "Use the arrow keys to move the panel. Hold Shift for larger steps."
    )
    expect(screen.queryByRole("button", { name: "Return to tray" })).toBeNull()
  })

  it("starts a native drag on a primary press only", () => {
    render(<PanelMoveHandle placement={{ movable: true, floating: false }} />)
    const grip = screen.getByRole("button", { name: "Move panel" })

    fireEvent.mouseDown(grip, { button: 2, detail: 1 })
    expect(mocks.startPanelDrag).not.toHaveBeenCalled()

    fireEvent.mouseDown(grip, { button: 0, detail: 1 })
    expect(mocks.startPanelDrag).toHaveBeenCalledTimes(1)
  })

  it("moves the panel with arrow keys and larger steps with Shift", () => {
    render(<PanelMoveHandle placement={{ movable: true, floating: false }} />)
    const grip = screen.getByRole("button", { name: "Move panel" })

    fireEvent.keyDown(grip, { key: "ArrowRight" })
    fireEvent.keyDown(grip, { key: "ArrowUp", shiftKey: true })
    fireEvent.keyDown(grip, { key: "a" })

    expect(mocks.nudgePanel.mock.calls).toEqual([
      [10, 0],
      [0, -50],
    ])
  })

  it("offers an explicit Return to tray action when floating", () => {
    render(<PanelMoveHandle placement={{ movable: true, floating: true }} />)

    fireEvent.click(screen.getByRole("button", { name: "Return to tray" }))

    expect(mocks.returnPanelToTray).toHaveBeenCalledTimes(1)
  })

  it("returns to the tray on a double-click of the grip without starting a drag", () => {
    render(<PanelMoveHandle placement={{ movable: true, floating: true }} />)
    const grip = screen.getByRole("button", { name: "Move panel" })

    fireEvent.mouseDown(grip, { button: 0, detail: 2 })

    expect(mocks.returnPanelToTray).toHaveBeenCalledTimes(1)
    expect(mocks.startPanelDrag).not.toHaveBeenCalled()
  })

  it("reports a failed native action", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.startPanelDrag.mockRejectedValue(new Error("boom"))
    render(<PanelMoveHandle placement={{ movable: true, floating: false }} />)

    fireEvent.mouseDown(screen.getByRole("button", { name: "Move panel" }), {
      button: 0,
      detail: 1,
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(error).toHaveBeenCalledWith("Failed to start moving the panel:", expect.any(Error))
    error.mockRestore()
  })
})
