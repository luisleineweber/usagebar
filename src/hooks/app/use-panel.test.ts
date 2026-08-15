import { act, render, renderHook, waitFor } from "@testing-library/react"
import { createElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { currentMonitorMock, invokeMock, isTauriMock, listenMock } = vi.hoisted(() => ({
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
  PANEL_AUTO_HIDE_DELAY_MS,
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

    listenMock.mockImplementation(
      async (event: string, callback: (event: { payload: unknown }) => void) => {
        callbacks.set(event, callback)
        return vi.fn()
      }
    )

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
      expect(listenMock).toHaveBeenCalledTimes(5)
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

    listenMock.mockResolvedValueOnce(unlistenNavigate).mockImplementationOnce(
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

  it("auto-hides the panel after 30 seconds of inactivity", async () => {
    vi.useFakeTimers()

    try {
      renderHook(() =>
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

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PANEL_AUTO_HIDE_DELAY_MS)
      })

      expect(invokeMock).toHaveBeenCalledWith("hide_panel")
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not auto-hide while the settings window is open", async () => {
    vi.useFakeTimers()
    const callbacks = new Map<string, (event: { payload: unknown }) => void>()

    listenMock.mockImplementation(
      async (event: string, callback: (event: { payload: unknown }) => void) => {
        callbacks.set(event, callback)
        return vi.fn()
      }
    )

    try {
      renderHook(() =>
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

      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      act(() => {
        callbacks.get("settings:open")?.({ payload: null })
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PANEL_AUTO_HIDE_DELAY_MS)
      })
      expect(invokeMock).not.toHaveBeenCalledWith("hide_panel")

      act(() => {
        callbacks.get("settings:closed")?.({ payload: null })
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PANEL_AUTO_HIDE_DELAY_MS - 1)
      })
      expect(invokeMock).not.toHaveBeenCalledWith("hide_panel")

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(invokeMock).toHaveBeenCalledWith("hide_panel")
    } finally {
      vi.useRealTimers()
    }
  })

  it("auto-hides when the settings window is minimized", async () => {
    vi.useFakeTimers()
    const callbacks = new Map<string, (event: { payload: unknown }) => void>()

    listenMock.mockImplementation(
      async (event: string, callback: (event: { payload: unknown }) => void) => {
        callbacks.set(event, callback)
        return vi.fn()
      }
    )

    try {
      renderHook(() =>
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

      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      act(() => {
        callbacks.get("settings:open")?.({ payload: null })
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PANEL_AUTO_HIDE_DELAY_MS)
      })
      expect(invokeMock).not.toHaveBeenCalledWith("hide_panel")

      act(() => {
        callbacks.get("settings:state")?.({ payload: { isMinimized: true } })
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PANEL_AUTO_HIDE_DELAY_MS)
      })

      expect(invokeMock).toHaveBeenCalledWith("hide_panel")
    } finally {
      vi.useRealTimers()
    }
  })

  it("resets auto-hide on panel activity and tray navigation", async () => {
    vi.useFakeTimers()
    const callbacks = new Map<string, (event: { payload: unknown }) => void>()

    listenMock.mockImplementation(
      async (event: string, callback: (event: { payload: unknown }) => void) => {
        callbacks.set(event, callback)
        return vi.fn()
      }
    )

    try {
      renderHook(() =>
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

      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(listenMock).toHaveBeenCalledTimes(5)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PANEL_AUTO_HIDE_DELAY_MS - 1)
      })
      expect(invokeMock).not.toHaveBeenCalledWith("hide_panel")

      act(() => {
        window.dispatchEvent(new Event("pointerdown"))
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PANEL_AUTO_HIDE_DELAY_MS - 1)
      })
      expect(invokeMock).not.toHaveBeenCalledWith("hide_panel")

      act(() => {
        callbacks.get("tray:navigate")?.({ payload: "codex" })
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PANEL_AUTO_HIDE_DELAY_MS - 1)
      })
      expect(invokeMock).not.toHaveBeenCalledWith("hide_panel")

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(invokeMock).toHaveBeenCalledWith("hide_panel")
    } finally {
      vi.useRealTimers()
    }
  })

  it("clears auto-hide when the hook unmounts or about is open", async () => {
    vi.useFakeTimers()

    try {
      const { rerender, unmount } = renderHook(
        ({ showAbout }) =>
          usePanel({
            activeView: "home",
            setActiveView: vi.fn(),
            showAbout,
            setShowAbout: vi.fn(),
            displayPlugins: [],
            navPluginCount: 0,
            onPanelFocus: vi.fn(),
          }),
        { initialProps: { showAbout: false } }
      )

      rerender({ showAbout: true })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PANEL_AUTO_HIDE_DELAY_MS)
      })
      expect(invokeMock).not.toHaveBeenCalledWith("hide_panel")

      rerender({ showAbout: false })
      unmount()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PANEL_AUTO_HIDE_DELAY_MS)
      })
      expect(invokeMock).not.toHaveBeenCalledWith("hide_panel")
    } finally {
      vi.useRealTimers()
    }
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

    listenMock.mockImplementation(
      async (event: string, callback: (event: { payload: unknown }) => void) => {
        callbacks.set(event, callback)
        return vi.fn()
      }
    )

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
      expect(listenMock).toHaveBeenCalledTimes(5)
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
    expect(panelPreferredMinHeightForView("home", 1)).toBe(292)
    expect(panelPreferredMinHeightForView("home", 3)).toBe(316)
    expect(panelPreferredMinHeightForView("opencode")).toBe(468)
    expect(panelPreferredMinHeightForView("opencode", 3)).toBe(468)
  })

  it("keeps a minimum height for the nav icon stack", () => {
    expect(panelMinHeightForNav()).toBe(144)
    expect(panelMinHeightForNav(false)).toBe(100)
  })

  it("syncs the measured panel height back to Rust", async () => {
    vi.useFakeTimers()
    const OriginalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver

    function Harness() {
      const { containerRef, contentColumnRef, scrollRef, contentMeasureRef, footerRef } = usePanel({
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
    } as typeof ResizeObserver

    function Harness() {
      const { containerRef, contentColumnRef, scrollRef, contentMeasureRef, footerRef } = usePanel({
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

  it("keeps the scroll fade stable during a panel tween", async () => {
    vi.useFakeTimers()
    const OriginalResizeObserver = globalThis.ResizeObserver
    const originalClientHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientHeight"
    )
    const resizeCallbacks: ResizeObserverCallback[] = []
    let reducedMotion = true
    let scrollHeightValue = 280
    let clientHeightValue = 280

    globalThis.ResizeObserver = class ResizeObserverStub {
      constructor(callback: ResizeObserverCallback) {
        resizeCallbacks.push(callback)
      }

      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: reducedMotion,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return scrollHeightValue
      },
    })
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return clientHeightValue
      },
    })

    let panelState: ReturnType<typeof usePanel> | null = null
    const displayPlugins: unknown[] = []

    function Harness() {
      panelState = usePanel({
        activeView: "home",
        setActiveView: vi.fn(),
        showAbout: false,
        setShowAbout: vi.fn(),
        displayPlugins,
        navPluginCount: 0,
        onPanelFocus: vi.fn(),
      })

      return createElement(
        "div",
        { ref: panelState.containerRef },
        createElement(
          "div",
          { ref: panelState.contentColumnRef },
          createElement(
            "div",
            { ref: panelState.scrollRef },
            createElement("div", { ref: panelState.contentMeasureRef }, "content")
          )
        ),
        createElement("div", { ref: panelState.footerRef }, "footer")
      )
    }

    try {
      const { rerender } = render(createElement(Harness))
      await act(async () => {
        await vi.runAllTimersAsync()
      })
      expect(panelState?.canScrollDown).toBe(false)

      reducedMotion = false
      scrollHeightValue = 520
      rerender(createElement(Harness))
      act(() => {
        resizeCallbacks[0]?.([], {} as ResizeObserver)
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(70)
      })
      expect(panelState?.isPanelResizing).toBe(true)

      clientHeightValue = 278
      act(() => {
        resizeCallbacks.at(-1)?.([], {} as ResizeObserver)
      })
      expect(panelState?.canScrollDown).toBe(false)

      await act(async () => {
        await vi.runAllTimersAsync()
      })
      expect(panelState?.canScrollDown).toBe(true)
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver
      if (originalClientHeight) {
        Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight)
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "clientHeight")
      }
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
    } as typeof ResizeObserver

    let scrollHeightValue = 120
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return scrollHeightValue
      },
    })

    function Harness() {
      const { containerRef, contentColumnRef, scrollRef, contentMeasureRef, footerRef } = usePanel({
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

      const applyCalls = invokeMock.mock.calls.filter(
        ([command]) => command === "apply_panel_bounds"
      )
      expect(applyCalls.length).toBeGreaterThan(1)
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver
      vi.useRealTimers()
    }
  })

  it("keeps small decreases but applies small increases", async () => {
    vi.useFakeTimers()
    const OriginalResizeObserver = globalThis.ResizeObserver
    const originalInnerHeight = window.innerHeight
    globalThis.ResizeObserver = class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 415,
    })
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    })

    let scrollHeightValue = 400
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return scrollHeightValue
      },
    })

    function Harness() {
      const { containerRef, contentColumnRef, scrollRef, contentMeasureRef, footerRef } = usePanel({
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
      await act(async () => {
        await vi.runAllTimersAsync()
      })

      invokeMock.mockClear()
      scrollHeightValue = 425
      rerender(createElement(Harness))
      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(
        invokeMock.mock.calls.filter(([command]) => command === "apply_panel_bounds")
      ).toHaveLength(1)

      invokeMock.mockClear()
      scrollHeightValue = 400
      rerender(createElement(Harness))
      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(invokeMock.mock.calls.filter(([command]) => command === "apply_panel_bounds")).toEqual(
        []
      )
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalInnerHeight,
      })
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
    } as typeof ResizeObserver

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
      const { containerRef, contentColumnRef, scrollRef, contentMeasureRef, footerRef } = usePanel({
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

      const applyCalls = invokeMock.mock.calls.filter(
        ([command]) => command === "apply_panel_bounds"
      )
      expect(applyCalls).toHaveLength(1)
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver
      vi.useRealTimers()
    }
  })
})
