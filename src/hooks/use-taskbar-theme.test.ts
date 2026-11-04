import { act, renderHook, waitFor } from "@testing-library/react"
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

import { useTaskbarTheme } from "@/hooks/use-taskbar-theme"
import { TASKBAR_THEME_EVENT } from "@/lib/taskbar-theme"

describe("useTaskbarTheme", () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.invoke.mockReset()
    mocks.listen.mockClear()
  })

  it("reads the taskbar theme from the native command", async () => {
    mocks.invoke.mockResolvedValue("light")
    const { result } = renderHook(() => useTaskbarTheme(true))

    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toBe("light"))
    expect(mocks.invoke).toHaveBeenCalledWith("get_taskbar_theme")
  })

  it("follows taskbar theme change events", async () => {
    mocks.invoke.mockResolvedValue("dark")
    const { result } = renderHook(() => useTaskbarTheme(true))
    await waitFor(() => expect(result.current).toBe("dark"))

    act(() => mocks.handlers.get(TASKBAR_THEME_EVENT)?.({ payload: "light" }))

    expect(result.current).toBe("light")
  })

  it("keeps a change event over a slower initial read", async () => {
    let resolveRead: (value: string) => void = () => {}
    mocks.invoke.mockReturnValue(new Promise((resolve) => (resolveRead = resolve)))
    const { result } = renderHook(() => useTaskbarTheme(true))
    await waitFor(() => expect(mocks.handlers.has(TASKBAR_THEME_EVENT)).toBe(true))

    act(() => mocks.handlers.get(TASKBAR_THEME_EVENT)?.({ payload: "light" }))
    await act(async () => resolveRead("dark"))

    expect(result.current).toBe("light")
  })

  it("reports an unexpected native value instead of guessing a theme", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.invoke.mockResolvedValue("blue")
    const { result } = renderHook(() => useTaskbarTheme(true))

    await waitFor(() => expect(consoleError).toHaveBeenCalled())
    expect(result.current).toBeNull()
    consoleError.mockRestore()
  })

  it("does not read the taskbar when disabled", () => {
    const { result } = renderHook(() => useTaskbarTheme(false))

    expect(result.current).toBeNull()
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.listen).not.toHaveBeenCalled()
  })
})
