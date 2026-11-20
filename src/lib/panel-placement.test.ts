import { beforeEach, describe, expect, it, vi } from "vitest"

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

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }))
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }))

import {
  DEFAULT_PANEL_MOVABLE,
  PANEL_PLACEMENT_CHANGED_EVENT,
  isMovablePanelSupported,
  listenPanelPlacement,
  loadPanelPlacement,
  nudgePanel,
  panelNudgeForKey,
  parsePanelPlacement,
  returnPanelToTray,
  setPanelMovable,
  startPanelDrag,
} from "@/lib/panel-placement"

describe("panel placement", () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.invoke.mockReset()
  })

  it("is anchored to the tray by default", () => {
    expect(DEFAULT_PANEL_MOVABLE).toBe(false)
  })

  it("is supported only on Windows, where native move tracking exists", () => {
    const userAgent = vi.spyOn(window.navigator, "userAgent", "get")
    userAgent.mockReturnValue("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/131.0")
    expect(isMovablePanelSupported()).toBe(true)
    userAgent.mockReturnValue("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36")
    expect(isMovablePanelSupported()).toBe(false)
    userAgent.mockRestore()
  })

  it("accepts only the native placement shape", () => {
    expect(parsePanelPlacement({ movable: true, floating: false, extra: 1 })).toEqual({
      movable: true,
      floating: false,
    })
    expect(() => parsePanelPlacement(null)).toThrow()
    expect(() => parsePanelPlacement({ movable: true })).toThrow()
    expect(() => parsePanelPlacement({ movable: "yes", floating: false })).toThrow()
  })

  it("uses camelCase command arguments", async () => {
    mocks.invoke.mockResolvedValue({ movable: true, floating: true })

    await loadPanelPlacement()
    await setPanelMovable(true)
    await nudgePanel(-10, 50)
    await returnPanelToTray()
    mocks.invoke.mockResolvedValue(undefined)
    await startPanelDrag()

    expect(mocks.invoke.mock.calls).toEqual([
      ["get_panel_placement"],
      ["set_panel_movable", { enabled: true }],
      ["nudge_panel", { dx: -10, dy: 50 }],
      ["return_panel_to_tray"],
      ["start_panel_drag"],
    ])
  })

  it("rejects an unexpected command result instead of guessing", async () => {
    mocks.invoke.mockResolvedValue(undefined)
    await expect(loadPanelPlacement()).rejects.toThrow("Unexpected panel placement")
  })

  it("forwards valid change events and drops malformed ones", async () => {
    const onChange = vi.fn()
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    await listenPanelPlacement(onChange)
    const handler = mocks.handlers.get(PANEL_PLACEMENT_CHANGED_EVENT)

    handler?.({ payload: { movable: true, floating: true } })
    handler?.({ payload: "bad" })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ movable: true, floating: true })
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it("maps arrow keys to logical nudges", () => {
    expect(panelNudgeForKey("ArrowLeft", false)).toEqual({ dx: -10, dy: 0 })
    expect(panelNudgeForKey("ArrowRight", false)).toEqual({ dx: 10, dy: 0 })
    expect(panelNudgeForKey("ArrowUp", true)).toEqual({ dx: 0, dy: -50 })
    expect(panelNudgeForKey("ArrowDown", true)).toEqual({ dx: 0, dy: 50 })
    expect(panelNudgeForKey("Enter", false)).toBeNull()
  })
})
