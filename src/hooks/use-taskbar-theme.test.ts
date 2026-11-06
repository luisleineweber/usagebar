import { act, renderHook, waitFor } from "@testing-library/react"
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

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }))
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }))

import { useTaskbarTheme, useTrayNumberSurface } from "@/hooks/use-taskbar-theme"
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

  it("reads the theme only after the change listener is registered", async () => {
    let finishRegistration: () => void = () => {}
    mocks.listen.mockImplementationOnce(
      (name: string, handler: (event: { payload: unknown }) => void) =>
        new Promise((resolve) => {
          finishRegistration = () => {
            mocks.handlers.set(name, handler)
            resolve(() => mocks.handlers.delete(name))
          }
        })
    )
    mocks.invoke.mockResolvedValue("dark")
    const { result } = renderHook(() => useTaskbarTheme(true))

    await waitFor(() => expect(mocks.listen).toHaveBeenCalled())
    expect(mocks.invoke).not.toHaveBeenCalled()

    await act(async () => finishRegistration())

    await waitFor(() => expect(result.current).toBe("dark"))
    expect(mocks.invoke).toHaveBeenCalledWith("get_taskbar_theme")
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

describe("useTrayNumberSurface", () => {
  const originalUserAgent = navigator.userAgent

  function setUserAgent(userAgent: string) {
    Object.defineProperty(window.navigator, "userAgent", { configurable: true, value: userAgent })
  }

  beforeEach(() => {
    mocks.handlers.clear()
    mocks.invoke.mockReset()
    mocks.listen.mockClear()
  })

  afterEach(() => setUserAgent(originalUserAgent))

  it("uses the dark surface on Linux without the Windows lookup", () => {
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15")
    const { result } = renderHook(() => useTrayNumberSurface())

    expect(result.current).toBe("dark")
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.listen).not.toHaveBeenCalled()
  })

  it("uses the taskbar theme on Windows", async () => {
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/130.0")
    mocks.invoke.mockResolvedValue("light")
    const { result } = renderHook(() => useTrayNumberSurface())

    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toBe("light"))
  })
})
