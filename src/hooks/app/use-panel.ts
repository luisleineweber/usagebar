import { useEffect, useRef, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { getCurrentWindow, PhysicalSize, currentMonitor } from "@tauri-apps/api/window"
import type { ActiveView } from "@/components/side-nav"

const PANEL_WIDTH = 400
const HOME_PANEL_MAX_HEIGHT_PX = 720
const DETAIL_PANEL_MAX_HEIGHT_PX = 860
const MAX_HEIGHT_FALLBACK_PX = 820
const MAX_HEIGHT_FRACTION_OF_MONITOR = 0.9
const SIDE_NAV_VERTICAL_PADDING_PX = 24
const SIDE_NAV_BUTTON_HEIGHT_PX = 44
const SIDE_NAV_STATIC_BUTTON_COUNT = 3 // Home + Help + Settings
const PANEL_RESIZE_STEP_MS = 18
const PANEL_RESIZE_MIN_DELTA_PX = 36
const PANEL_RESIZE_MAX_STEPS = 3

function getMonitorLogicalHeight(monitor: Awaited<ReturnType<typeof currentMonitor>>): number | null {
  if (!monitor) return null
  const workAreaHeight = monitor.workArea?.size.height
  if (typeof workAreaHeight === "number" && Number.isFinite(workAreaHeight) && workAreaHeight > 0) {
    return workAreaHeight
  }
  const monitorHeight = monitor.size?.height
  if (typeof monitorHeight === "number" && Number.isFinite(monitorHeight) && monitorHeight > 0) {
    return monitorHeight
  }
  return null
}

export function panelMaxHeightForView(activeView: ActiveView): number {
  if (activeView === "home") return HOME_PANEL_MAX_HEIGHT_PX
  return DETAIL_PANEL_MAX_HEIGHT_PX
}

export function panelMinHeightForNav(providerCount: number): number {
  const normalizedProviderCount = Math.max(0, Math.floor(providerCount))
  const buttonCount = SIDE_NAV_STATIC_BUTTON_COUNT + normalizedProviderCount
  return SIDE_NAV_VERTICAL_PADDING_PX + buttonCount * SIDE_NAV_BUTTON_HEIGHT_PX
}

function buildResizeHeights(fromHeight: number, toHeight: number): number[] {
  const roundedFrom = Math.max(1, Math.round(fromHeight))
  const roundedTo = Math.max(1, Math.round(toHeight))
  if (roundedTo <= roundedFrom) return [roundedTo]
  const delta = Math.abs(roundedTo - roundedFrom)
  if (delta < PANEL_RESIZE_MIN_DELTA_PX) return [roundedTo]

  const stepCount = Math.min(PANEL_RESIZE_MAX_STEPS, Math.max(2, Math.ceil(delta / 140)))
  const heights: number[] = []
  for (let step = 1; step <= stepCount; step += 1) {
    const progress = step / stepCount
    const easedProgress = 1 - Math.pow(1 - progress, 2)
    const nextHeight = Math.max(
      1,
      Math.round(roundedFrom + (roundedTo - roundedFrom) * easedProgress)
    )
    if (heights[heights.length - 1] !== nextHeight) {
      heights.push(nextHeight)
    }
  }
  if (heights[heights.length - 1] !== roundedTo) {
    heights.push(roundedTo)
  }
  return heights
}

type UsePanelArgs = {
  activeView: ActiveView
  setActiveView: (view: ActiveView) => void
  showAbout: boolean
  setShowAbout: (value: boolean) => void
  displayPlugins: unknown[]
  navPluginCount: number
  onPanelFocus?: () => void
}

export function usePanel({
  activeView,
  setActiveView,
  showAbout,
  setShowAbout,
  displayPlugins,
  navPluginCount,
  onPanelFocus,
}: UsePanelArgs) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentColumnRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentMeasureRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const [panelHeightPx, setPanelHeightPx] = useState<number | null>(null)
  const [maxPanelHeightPx, setMaxPanelHeightPx] = useState<number | null>(null)
  const currentPanelHeightPxRef = useRef<number | null>(null)
  const maxPanelHeightPxRef = useRef<number | null>(null)
  const targetPanelHeightPxRef = useRef<number | null>(null)
  const resizeSequenceIdRef = useRef(0)
  const requestPanelResizeRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!isTauri()) return
    invoke("init_panel").catch(console.error)
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    if (showAbout) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        invoke("hide_panel")
      }
    }

    const handleFocus = () => {
      requestPanelResizeRef.current()
      onPanelFocus?.()
    }

    document.addEventListener("keydown", handleKeyDown)
    window.addEventListener("focus", handleFocus)

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("focus", handleFocus)
    }
  }, [onPanelFocus, showAbout])

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    const unlisteners: (() => void)[] = []

    async function setup() {
      const u1 = await listen<string>("tray:navigate", (event) => {
        setActiveView(event.payload as ActiveView)
      })
      if (cancelled) {
        u1()
        return
      }
      unlisteners.push(u1)

      const u2 = await listen("tray:show-about", () => {
        setShowAbout(true)
      })
      if (cancelled) {
        u2()
        return
      }
      unlisteners.push(u2)
    }

    void setup()

    return () => {
      cancelled = true
      for (const fn of unlisteners) {
        if (typeof fn === "function") {
          fn()
        }
      }
    }
  }, [setActiveView, setShowAbout])

  useEffect(() => {
    if (!isTauri()) return
    const container = containerRef.current
    if (!container) return
    let isDisposed = false

    const currentWindow = getCurrentWindow()

    const pauseBetweenResizeSteps = () =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, PANEL_RESIZE_STEP_MS)
      })

    const applyHeight = (factor: number, width: number, logicalHeight: number) => {
      const roundedHeight = Math.max(1, Math.round(logicalHeight))
      if (targetPanelHeightPxRef.current === roundedHeight) return
      const previousHeight = currentPanelHeightPxRef.current
        ?? Math.max(1, Math.round(window.innerHeight || 0))
      const heights = buildResizeHeights(previousHeight, roundedHeight)
      const sequenceId = resizeSequenceIdRef.current + 1
      resizeSequenceIdRef.current = sequenceId
      targetPanelHeightPxRef.current = roundedHeight

      const operation = async () => {
        let lastHeight = previousHeight
        for (let index = 0; index < heights.length; index += 1) {
          if (isDisposed || resizeSequenceIdRef.current !== sequenceId) return
          const nextHeight = heights[index]
          const isGrowing = nextHeight > lastHeight

          currentPanelHeightPxRef.current = nextHeight
          setPanelHeightPx((prev) => (prev === nextHeight ? prev : nextHeight))

          const resizeWindow = () =>
            Promise.resolve(currentWindow.setSize(new PhysicalSize(width, Math.ceil(nextHeight * factor))))
          const repositionWindow = () =>
            Promise.resolve(invoke("reposition_panel", { panelHeightPx: nextHeight }))

          if (isGrowing) {
            await repositionWindow()
            if (isDisposed || resizeSequenceIdRef.current !== sequenceId) return
            await resizeWindow()
          } else {
            await resizeWindow()
            if (isDisposed || resizeSequenceIdRef.current !== sequenceId) return
            await repositionWindow()
          }

          lastHeight = nextHeight
          if (index < heights.length - 1) {
            await pauseBetweenResizeSteps()
          }
        }
      }

      void operation().catch((e) => {
        console.error("Failed to resize window:", e)
      })
    }

    const resizeWindow = async () => {
      if (isDisposed) return
      const factor = window.devicePixelRatio
      const width = Math.ceil(PANEL_WIDTH * factor)
      const contentHeightLogical = Math.ceil(
        contentMeasureRef.current?.scrollHeight ??
          scrollRef.current?.scrollHeight ??
          container.scrollHeight
      )
      const footerHeightLogical = Math.ceil(
        footerRef.current?.getBoundingClientRect().height ?? 0
      )
      const contentColumnStyle = contentColumnRef.current
        ? window.getComputedStyle(contentColumnRef.current)
        : null
      const paddingTopLogical = Math.ceil(
        Number.parseFloat(contentColumnStyle?.paddingTop ?? "0") || 0
      )
      const paddingBottomLogical = Math.ceil(
        Number.parseFloat(contentColumnStyle?.paddingBottom ?? "0") || 0
      )
      const desiredHeightLogical = Math.max(
        1,
        contentHeightLogical + footerHeightLogical + paddingTopLogical + paddingBottomLogical
      )
      const navMinHeightLogical = panelMinHeightForNav(navPluginCount)
      const panelMaxHeightPx = panelMaxHeightForView(activeView)

      let maxHeightPhysical: number | null = null
      let maxHeightLogical: number | null = null

      try {
        const monitor = await currentMonitor()
        const monitorHeight = getMonitorLogicalHeight(monitor)
        if (monitorHeight !== null) {
          maxHeightPhysical = Math.floor(
            Math.min(monitorHeight * factor * MAX_HEIGHT_FRACTION_OF_MONITOR, panelMaxHeightPx * factor)
          )
          maxHeightLogical = Math.floor(maxHeightPhysical / factor)
        }
      } catch {
        // fall through to fallback
      }

      if (maxHeightLogical === null) {
        const screenAvailHeight = Number(window.screen?.availHeight) || MAX_HEIGHT_FALLBACK_PX
        maxHeightLogical = Math.floor(
          Math.min(screenAvailHeight * MAX_HEIGHT_FRACTION_OF_MONITOR, panelMaxHeightPx)
        )
        maxHeightPhysical = Math.floor(maxHeightLogical * factor)
      }

      if (maxPanelHeightPxRef.current !== maxHeightLogical) {
        maxPanelHeightPxRef.current = maxHeightLogical
        setMaxPanelHeightPx(maxHeightLogical)
      }

      const nextHeightLogical = Math.min(
        maxHeightLogical,
        Math.max(navMinHeightLogical, desiredHeightLogical)
      )

      applyHeight(factor, width, nextHeightLogical)
    }

    const scheduleResize = () => {
      void resizeWindow().catch((e) => {
        console.error("Failed to resize window:", e)
      })
    }
    requestPanelResizeRef.current = scheduleResize

    scheduleResize()

    const observer = new ResizeObserver(() => {
      scheduleResize()
    })
    observer.observe(container)

    return () => {
      isDisposed = true
      resizeSequenceIdRef.current += 1
      requestPanelResizeRef.current = () => {}
      observer.disconnect()
    }
  }, [activeView, displayPlugins, navPluginCount])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const check = () => {
      setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 1)
    }

    check()
    el.addEventListener("scroll", check, { passive: true })

    const ro = new ResizeObserver(check)
    ro.observe(el)

    const mo = new MutationObserver(check)
    mo.observe(el, { childList: true, subtree: true })

    return () => {
      el.removeEventListener("scroll", check)
      ro.disconnect()
      mo.disconnect()
    }
  }, [activeView])

  return {
    containerRef,
    contentColumnRef,
    scrollRef,
    contentMeasureRef,
    footerRef,
    canScrollDown,
    panelHeightPx,
    maxPanelHeightPx,
  }
}
