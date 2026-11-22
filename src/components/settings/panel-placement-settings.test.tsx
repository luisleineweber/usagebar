import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (event: { payload: unknown }) => void>()
  return {
    handlers,
    invoke: vi.fn(),
    listen: vi.fn(async (name: string, handler: (event: { payload: unknown }) => void) => {
      handlers.set(name, handler)
      return () => handlers.delete(name)
    }),
  }
})

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke, isTauri: () => true }))
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }))

import { PanelPlacementSettings } from "@/components/settings/panel-placement-settings"
import { PANEL_PLACEMENT_CHANGED_EVENT } from "@/lib/panel-placement"

function mockNative(initial: { movable: boolean; floating: boolean }) {
  mocks.invoke.mockImplementation(async (command: string, args?: { enabled?: boolean }) => {
    switch (command) {
      case "get_panel_placement":
        return initial
      case "set_panel_movable":
        return { movable: args?.enabled === true, floating: false }
      case "return_panel_to_tray":
        return { movable: true, floating: false }
      default:
        throw new Error(`unexpected command ${command}`)
    }
  })
}

const WINDOWS_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/131.0"

describe("PanelPlacementSettings", () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.invoke.mockReset()
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(WINDOWS_USER_AGENT)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("keeps keyboard focus on the checkbox after a save", async () => {
    mockNative({ movable: false, floating: false })
    render(<PanelPlacementSettings />)
    const checkbox = await screen.findByRole("checkbox", { name: "Movable panel" })
    checkbox.focus()

    fireEvent.click(checkbox)
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Movable panel" })).toBeChecked()
    )

    // The same element stays mounted and focused, so a second Space works.
    expect(screen.getByRole("checkbox", { name: "Movable panel" })).toBe(checkbox)
    expect(checkbox).toHaveFocus()
  })

  it("hides the setting and never calls native code outside Windows", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15"
    )
    mockNative({ movable: true, floating: true })
    const { container } = render(<PanelPlacementSettings />)

    await act(async () => {})

    expect(container).toBeEmptyDOMElement()
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.listen).not.toHaveBeenCalled()
  })

  it("shows the anchored default and turns Movable panel on", async () => {
    mockNative({ movable: false, floating: false })
    render(<PanelPlacementSettings />)

    const checkbox = await screen.findByRole("checkbox", { name: "Movable panel" })
    expect(checkbox).not.toBeChecked()
    expect(screen.queryByRole("button", { name: "Return to tray" })).toBeNull()

    fireEvent.click(checkbox)

    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Movable panel" })).toBeChecked()
    )
    expect(mocks.invoke).toHaveBeenCalledWith("set_panel_movable", { enabled: true })
  })

  it("returns a floating panel to the tray", async () => {
    mockNative({ movable: true, floating: true })
    render(<PanelPlacementSettings />)

    fireEvent.click(await screen.findByRole("button", { name: "Return to tray" }))

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("return_panel_to_tray"))
  })

  it("follows placement changes from the panel window", async () => {
    mockNative({ movable: true, floating: false })
    render(<PanelPlacementSettings />)
    await screen.findByRole("checkbox", { name: "Movable panel" })

    act(() =>
      mocks.handlers.get(PANEL_PLACEMENT_CHANGED_EVENT)?.({
        payload: { movable: true, floating: true },
      })
    )

    expect(screen.getByRole("button", { name: "Return to tray" })).toBeInTheDocument()
  })

  it("shows a native failure instead of pretending the change worked", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    mockNative({ movable: false, floating: false })
    render(<PanelPlacementSettings />)
    const checkbox = await screen.findByRole("checkbox", { name: "Movable panel" })
    mocks.invoke.mockRejectedValueOnce("could not save panel placement: disk full")

    fireEvent.click(checkbox)

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not save panel placement: disk full"
    )
    expect(screen.getByRole("checkbox", { name: "Movable panel" })).not.toBeChecked()
    error.mockRestore()
  })
})
