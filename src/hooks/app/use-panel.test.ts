import { act, render, renderHook, waitFor } from "@testing-library/react"
import { createElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  currentMonitorMock,
  invokeMock,
  isTauriMock,
  listenMock,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isTauriMock: vi.fn(),
  listenMock: vi.fn(),
  currentMonitorMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: isTauriMock,
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}))

vi.mock("@tauri-apps/api/window", () => ({
  currentMonitor: currentMonitorMock,
}))

import {
  panelMaxHeightForView,
  panelMinHeightForNav,
  panelMinHeightForView,
  panelPreferredMinHeightForView,
  usePanel,
} from "@/hooks/app/use-panel"

describe("usePanel", () => {
  beforeEach(() => {
    invokeMock.mockReset()
    isTauriMock.mockReset()
    listenMock.mockReset()
    currentMonitorMock.mockReset()

    isTauriMock.mockReturnValue(true)
    invokeMock.mockResolvedValue(undefined)
    listenMock.mockResolvedValue(vi.fn())
    currentMonitorMock.mockResolvedValue(null)
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return 160
      },
    })
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    })
  })

  it("handles tray show-about event", async () => {
    const setShowAbout = vi.fn()
    const callbacks = new Map<string, (event: { payload: unknown }) => void>()

    listenMock.mockImplementation(async (event: string, callback: (event: { payload: unknown }) => void) => {
      callbacks.set(event, callback)
      return vi.fn()
    })

    renderHook(() =>
      usePanel({
        activeView: "home",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout,
        displayPlugins: [],
        navPluginCount: 0,
        onPanelFocus: vi.fn(),
      })
    )

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalledTimes(2)
    })

    act(() => {
      callbacks.get("tray:show-about")?.({ payload: null })
    })

    expect(setShowAbout).toHaveBeenCalledWith(true)
  })

  it("cleans first listener if hook unmounts before setup resolves", async () => {
    const unlistenNavigate = vi.fn()
    let resolveNavigate: ((value: () => void) => void) | null = null

    listenMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNavigate = resolve
          })
      )
      .mockResolvedValue(vi.fn())

    const { unmount } = renderHook(() =>
      usePanel({
        activeView: "home",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout: vi.fn(),
        displayPlugins: [],
        navPluginCount: 0,
        onPanelFocus: vi.fn(),
      })
    )

    unmount()
    resolveNavigate?.(unlistenNavigate)

    await waitFor(() => {
      expect(unlistenNavigate).toHaveBeenCalledTimes(1)
    })
  })

  it("cleans second listener if hook unmounts between listener registrations", async () => {
    const unlistenNavigate = vi.fn()
    const unlistenShowAbout = vi.fn()
    let resolveShowAbout: ((value: () => void) => void) | null = null

    listenMock
      .mockResolvedValueOnce(unlistenNavigate)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveShowAbout = resolve
          })
      )

    const { unmount } = renderHook(() =>
      usePanel({
        activeView: "home",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout: vi.fn(),
        displayPlugins: [],
        navPluginCount: 0,
        onPanelFocus: vi.fn(),
      })
    )

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalledTimes(2)
    })

    unmount()
    resolveShowAbout?.(unlistenShowAbout)

    await waitFor(() => {
      expect(unlistenShowAbout).toHaveBeenCalledTimes(1)
    })
  })

  it("calls onPanelFocus when the window gains focus", async () => {
    const onPanelFocus = vi.fn()

    renderHook(() =>
      usePanel({
        activeView: "home",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout: vi.fn(),
        displayPlugins: [],
        navPluginCount: 0,
        onPanelFocus,
      })
    )

    await act(async () => {
      window.dispatchEvent(new Event("focus"))
    })

    expect(onPanelFocus).toHaveBeenCalledTimes(1)
  })

  it("replays a pending panel target on focus and refreshes that provider", async () => {
    const setActiveView = vi.fn()
    const onPanelFocus = vi.fn()
    const pendingViews = [null, "codex"]

    invokeMock.mockImplementation(async (command: string) => {
      if (command === "take_pending_panel_view") {
        return pendingViews.shift() ?? null
      }
      return undefined
    })

    renderHook(() =>
      usePanel({
        activeView: "home",
        setActiveView,
        showAbout: false,
        setShowAbout: vi.fn(),
        displayPlugins: [],
        navPluginCount: 0,
        onPanelFocus,
      })
    )

    await act(async () => {
      window.dispatchEvent(new Event("focus"))
    })

    await waitFor(() => {
      expect(setActiveView).toHaveBeenCalledWith("codex")
      expect(onPanelFocus).toHaveBeenCalledWith("codex")
    })
  })

  it("refreshes the explicitly navigated provider when tray navigation fires", async () => {
    const setActiveView = vi.fn()
    const onPanelFocus = vi.fn()
    const callbacks = new Map<string, (event: { payload: unknown }) => void>()

    listenMock.mockImplementation(async (event: string, callback: (event: { payload: unknown }) => void) => {
      callbacks.set(event, callback)
      return vi.fn()
    })

    renderHook(() =>
      usePanel({
        activeView: "home",
        setActiveView,
        showAbout: false,
        setShowAbout: vi.fn(),
        displayPlugins: [],
        navPluginCount: 0,
        onPanelFocus,
      })
    )

    await waitFor(() => {
      expect(listenMock).toHaveBeenCalledTimes(2)
    })

    act(() => {
      callbacks.get("tray:navigate")?.({ payload: "codex" })
    })

    expect(setActiveView).toHaveBeenCalledWith("codex")
    expect(onPanelFocus).toHaveBeenCalledWith("codex")
    expect(invokeMock).toHaveBeenCalledWith("take_pending_panel_view")
  })

  it("uses larger height caps for home and provider detail views", () => {
    expect(panelMaxHeightForView("home")).toBe(720)
    expect(panelMaxHeightForView("opencode")).toBe(860)
  })

  it("uses stable minimum height floors for home and provider detail views", () => {
    expect(panelMinHeightForView("home")).toBe(280)
    expect(panelMinHeightForView("opencode")).toBe(400)
  })

  it("uses a stronger preferred baseline for provider detail views", () => {
    expect(panelPreferredMinHeightForView("home")).toBe(280)
    expect(panelPreferredMinHeightForView("opencode")).toBe(468)
  })

  it("keeps a minimum height for the nav icon stack", () => {
    expect(panelMinHeightForNav(0)).toBe(156)
    expect(panelMinHeightForNav(4)).toBe(332)
  })

  it("syncs the measured panel height back to Rust", async () => {
    vi.useFakeTimers()
    const OriginalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver

    function Harness() {
      const {
        containerRef,
        contentColumnRef,
        scrollRef,
        contentMeasureRef,
        footerRef,
      } = usePanel({
        activeView: "home",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout: vi.fn(),
        displayPlugins: [],
        navPluginCount: 0,
        onPanelFocus: vi.fn(),
      })

      return createElement(
        "div",
        { ref: containerRef },
        createElement(
          "div",
          { ref: contentColumnRef },
          createElement(
            "div",
            { ref: scrollRef },
            createElement("div", { ref: contentMeasureRef }, "content")
          )
        ),
        createElement("div", { ref: footerRef }, "footer")
      )
    }

    try {
      render(createElement(Harness))
      await vi.runAllTimersAsync()
      expect(invokeMock).toHaveBeenCalledWith(
        "sync_panel_geometry",
        expect.objectContaining({ panelHeightPx: expect.any(Number) })
      )
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver
      vi.useRealTimers()
    }
  })

  it("observes intrinsic content nodes instead of the outer shell", async () => {
    vi.useFakeTimers()
    const observeMock = vi.fn()
    const OriginalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = class ResizeObserverStub {
      observe = observeMock
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver

    function Harness() {
      const {
        containerRef,
        contentColumnRef,
        scrollRef,
        contentMeasureRef,
        footerRef,
      } = usePanel({
        activeView: "home",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout: vi.fn(),
        displayPlugins: [],
        navPluginCount: 0,
        onPanelFocus: vi.fn(),
      })

      return createElement(
        "div",
        { ref: containerRef, "data-testid": "container" },
        createElement(
          "div",
          { ref: contentColumnRef },
          createElement(
            "div",
            { ref: scrollRef, "data-testid": "scroll" },
            createElement("div", { ref: contentMeasureRef, "data-testid": "content" }, "content")
          )
        ),
        createElement("div", { ref: footerRef, "data-testid": "footer" }, "footer")
      )
    }

    try {
      const { getByTestId } = render(createElement(Harness))
      await vi.runAllTimersAsync()

      expect(observeMock).toHaveBeenCalledWith(getByTestId("content"))
      expect(observeMock).toHaveBeenCalledWith(getByTestId("scroll"))
      expect(observeMock).toHaveBeenCalledWith(getByTestId("footer"))
      expect(observeMock).not.toHaveBeenCalledWith(getByTestId("container"))
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver
      vi.useRealTimers()
    }
  })

  it("tweens larger height changes through bounded backend updates", async () => {
    vi.useFakeTimers()
    const OriginalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver

    let scrollHeightValue = 120
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return scrollHeightValue
      },
    })

    function Harness() {
      const {
        containerRef,
        contentColumnRef,
        scrollRef,
        contentMeasureRef,
        footerRef,
      } = usePanel({
        activeView: "home",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout: vi.fn(),
        displayPlugins: [],
        navPluginCount: 0,
        onPanelFocus: vi.fn(),
      })

      return createElement(
        "div",
        { ref: containerRef },
        createElement(
          "div",
          { ref: contentColumnRef },
          createElement(
            "div",
            { ref: scrollRef },
            createElement("div", { ref: contentMeasureRef }, "content")
          )
        ),
        createElement("div", { ref: footerRef }, "footer")
      )
    }

    try {
      const { rerender } = render(createElement(Harness))
      await vi.runAllTimersAsync()

      invokeMock.mockClear()
      scrollHeightValue = 520
      rerender(createElement(Harness))
      await vi.runAllTimersAsync()

      const applyCalls = invokeMock.mock.calls.filter(([command]) => command === "apply_panel_bounds")
      expect(applyCalls.length).toBeGreaterThan(1)
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver
      vi.useRealTimers()
    }
  })

  it("skips tweening when reduced motion is enabled", async () => {
    vi.useFakeTimers()
    const OriginalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    })

    let scrollHeightValue = 120
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return scrollHeightValue
      },
    })

    function Harness() {
      const {
        containerRef,
        contentColumnRef,
        scrollRef,
        contentMeasureRef,
        footerRef,
      } = usePanel({
        activeView: "home",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout: vi.fn(),
        displayPlugins: [],
        navPluginCount: 0,
        onPanelFocus: vi.fn(),
      })

      return createElement(
        "div",
        { ref: containerRef },
        createElement(
          "div",
          { ref: contentColumnRef },
          createElement(
            "div",
            { ref: scrollRef },
            createElement("div", { ref: contentMeasureRef }, "content")
          )
        ),
        createElement("div", { ref: footerRef }, "footer")
      )
    }

    try {
      const { rerender } = render(createElement(Harness))
      await vi.runAllTimersAsync()

      invokeMock.mockClear()
      scrollHeightValue = 520
      rerender(createElement(Harness))
      await vi.runAllTimersAsync()

      const applyCalls = invokeMock.mock.calls.filter(([command]) => command === "apply_panel_bounds")
      expect(applyCalls).toHaveLength(1)
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver
      vi.useRealTimers()
    }
  })
})
