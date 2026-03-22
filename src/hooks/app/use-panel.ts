import { useEffect, useRef, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { currentMonitor } from "@tauri-apps/api/window"
import type { ActiveView } from "@/components/side-nav"

const HOME_PANEL_MAX_HEIGHT_PX = 720
const DETAIL_PANEL_MAX_HEIGHT_PX = 860
const HOME_PANEL_MIN_HEIGHT_PX = 280
const DETAIL_PANEL_MIN_HEIGHT_PX = 400
const DETAIL_PANEL_BASE_HEIGHT_PX = 468
const MAX_HEIGHT_FALLBACK_PX = 820
const MAX_HEIGHT_FRACTION_OF_MONITOR = 0.9
const PANEL_HEIGHT_DELTA_THRESHOLD_PX = 2
const PANEL_HEIGHT_TWEEN_THRESHOLD_PX = 12
const PANEL_HEIGHT_TWEEN_DURATION_MS = 150
const PANEL_HEIGHT_TWEEN_STEPS = 3
const SIDE_NAV_VERTICAL_PADDING_PX = 24
const SIDE_NAV_BUTTON_HEIGHT_PX = 44
const SIDE_NAV_STATIC_BUTTON_COUNT = 3 // Home + Help + Settings

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

export function panelMinHeightForView(activeView: ActiveView): number {
  if (activeView === "home") return HOME_PANEL_MIN_HEIGHT_PX
  return DETAIL_PANEL_MIN_HEIGHT_PX
}

export function panelPreferredMinHeightForView(activeView: ActiveView): number {
  if (activeView === "home") return HOME_PANEL_MIN_HEIGHT_PX
  return DETAIL_PANEL_BASE_HEIGHT_PX
}

export function panelMinHeightForNav(providerCount: number): number {
  const normalizedProviderCount = Math.max(0, Math.floor(providerCount))
  const buttonCount = SIDE_NAV_STATIC_BUTTON_COUNT + normalizedProviderCount
  return SIDE_NAV_VERTICAL_PADDING_PX + buttonCount * SIDE_NAV_BUTTON_HEIGHT_PX
}

type UsePanelArgs = {
  activeView: ActiveView
  setActiveView: (view: ActiveView) => void
  showAbout: boolean
  setShowAbout: (value: boolean) => void
  displayPlugins: unknown[]
  navPluginCount: number
  onPanelFocus?: (view?: ActiveView) => void
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
  const [isPanelResizing, setIsPanelResizing] = useState(false)
  const currentPanelHeightPxRef = useRef<number | null>(null)
  const maxPanelHeightPxRef = useRef<number | null>(null)
  const measuredTargetPanelHeightPxRef = useRef<number | null>(null)
  const resizeSequenceIdRef = useRef(0)
  const requestPanelResizeRef = useRef<() => void>(() => {})
  const scheduledResizeFrameRef = useRef<number | null>(null)
  const scheduledMeasureFrameRef = useRef<number | null>(null)
  const tweenTimeoutsRef = useRef<number[]>([])

  useEffect(() => {
    if (!isTauri()) return

    const syncPendingPanelView = async () => {
      const pendingView = await invoke<string | null>("take_pending_panel_view")
      if (typeof pendingView !== "string") return null
      const normalizedView = pendingView.trim()
      if (!normalizedView) return null
      setActiveView(normalizedView as ActiveView)
      return normalizedView as ActiveView
    }

    void syncPendingPanelView()
      .then((pendingView) => {
        if (pendingView) {
          onPanelFocus?.(pendingView)
        }
      })
      .catch((error) => {
        console.error("Failed to sync pending panel view:", error)
      })
  }, [onPanelFocus, setActiveView])

  useEffect(() => {
    if (!isTauri()) return
    invoke("init_panel").catch(console.error)
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    if (showAbout) return

    const syncPendingPanelView = async () => {
      const pendingView = await invoke<string | null>("take_pending_panel_view")
      if (typeof pendingView !== "string") return null
      const normalizedView = pendingView.trim()
      if (!normalizedView) return null
      setActiveView(normalizedView as ActiveView)
      return normalizedView as ActiveView
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        invoke("hide_panel")
      }
    }

    const handleFocus = () => {
      void syncPendingPanelView()
        .catch((error) => {
          console.error("Failed to sync pending panel view on focus:", error)
          return null
        })
        .then((pendingView) => {
          requestPanelResizeRef.current()
          onPanelFocus?.(pendingView ?? undefined)
        })
    }

    document.addEventListener("keydown", handleKeyDown)
    window.addEventListener("focus", handleFocus)

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("focus", handleFocus)
    }
  }, [onPanelFocus, setActiveView, showAbout])

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    const unlisteners: (() => void)[] = []

    async function setup() {
      const u1 = await listen<string>("tray:navigate", (event) => {
        const nextView = event.payload as ActiveView
        setActiveView(nextView)
        onPanelFocus?.(nextView)
        void invoke("take_pending_panel_view").catch((error) => {
          console.error("Failed to clear pending panel view after live navigation:", error)
        })
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
  }, [onPanelFocus, setActiveView, setShowAbout])

  useEffect(() => {
    if (!isTauri()) return
    const container = containerRef.current
    if (!container) return
    let isDisposed = false

    const prefersReducedMotion = () => {
      if (typeof window.matchMedia !== "function") return false
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    }

    const clearHeightTween = () => {
      for (const timeoutId of tweenTimeoutsRef.current) {
        window.clearTimeout(timeoutId)
      }
      tweenTimeoutsRef.current = []
      setIsPanelResizing(false)
    }

    const applyHeightStep = (roundedHeight: number, sequenceId: number) => {
      const operation = async () => {
        if (isDisposed || resizeSequenceIdRef.current !== sequenceId) return

        currentPanelHeightPxRef.current = roundedHeight
        setPanelHeightPx((prev) => (prev === roundedHeight ? prev : roundedHeight))

        await Promise.resolve(invoke("sync_panel_geometry", { panelHeightPx: roundedHeight }))
        if (isDisposed || resizeSequenceIdRef.current !== sequenceId) return

        await Promise.resolve(invoke("apply_panel_bounds", { panelHeightPx: roundedHeight }))
        if (isDisposed || resizeSequenceIdRef.current !== sequenceId) return
      }

      void operation().catch((e) => {
        console.error("Failed to resize window:", e)
      })
    }

    const applyHeight = (logicalHeight: number) => {
      const roundedHeight = Math.max(1, Math.round(logicalHeight))
      const previousTarget = measuredTargetPanelHeightPxRef.current
      if (
        previousTarget !== null &&
        Math.abs(previousTarget - roundedHeight) < PANEL_HEIGHT_DELTA_THRESHOLD_PX
      ) {
        return
      }
      if (
        measuredTargetPanelHeightPxRef.current === roundedHeight &&
        currentPanelHeightPxRef.current === roundedHeight
      ) {
        return
      }
      const sequenceId = resizeSequenceIdRef.current + 1
      resizeSequenceIdRef.current = sequenceId
      measuredTargetPanelHeightPxRef.current = roundedHeight

      const currentDisplayedHeight = currentPanelHeightPxRef.current
        ?? Math.max(1, Math.round(window.innerHeight || roundedHeight))
      const delta = roundedHeight - currentDisplayedHeight

      clearHeightTween()

      if (prefersReducedMotion() || Math.abs(delta) < PANEL_HEIGHT_TWEEN_THRESHOLD_PX) {
        applyHeightStep(roundedHeight, sequenceId)
        return
      }

      setIsPanelResizing(true)

      for (let step = 1; step <= PANEL_HEIGHT_TWEEN_STEPS; step += 1) {
        const progress = step / PANEL_HEIGHT_TWEEN_STEPS
        const easedProgress = 1 - Math.pow(1 - progress, 2)
        const nextHeight = Math.round(currentDisplayedHeight + delta * easedProgress)
        const timeoutId = window.setTimeout(() => {
          applyHeightStep(nextHeight, sequenceId)
          if (step === PANEL_HEIGHT_TWEEN_STEPS && resizeSequenceIdRef.current === sequenceId) {
            tweenTimeoutsRef.current = []
            setIsPanelResizing(false)
          }
        }, Math.round((PANEL_HEIGHT_TWEEN_DURATION_MS / PANEL_HEIGHT_TWEEN_STEPS) * step))
        tweenTimeoutsRef.current.push(timeoutId)
      }
    }

      const resizeWindow = async () => {
        if (isDisposed) return
        const factor = window.devicePixelRatio
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
      const viewMinHeightLogical = panelPreferredMinHeightForView(activeView)
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
        Math.max(navMinHeightLogical, viewMinHeightLogical, desiredHeightLogical)
      )

      applyHeight(nextHeightLogical)
    }

    const scheduleResize = () => {
      if (scheduledMeasureFrameRef.current !== null) {
        window.cancelAnimationFrame(scheduledMeasureFrameRef.current)
      }
      scheduledMeasureFrameRef.current = window.requestAnimationFrame(() => {
        scheduledMeasureFrameRef.current = null
        if (scheduledResizeFrameRef.current !== null) {
          window.cancelAnimationFrame(scheduledResizeFrameRef.current)
        }
        scheduledResizeFrameRef.current = window.requestAnimationFrame(() => {
          scheduledResizeFrameRef.current = null
          void resizeWindow().catch((e) => {
            console.error("Failed to resize window:", e)
          })
        })
      })
    }
    requestPanelResizeRef.current = scheduleResize

    scheduleResize()

    const observer = new ResizeObserver(() => {
      scheduleResize()
    })
    if (contentMeasureRef.current) observer.observe(contentMeasureRef.current)
    if (footerRef.current) observer.observe(footerRef.current)
    if (scrollRef.current) observer.observe(scrollRef.current)

    return () => {
      isDisposed = true
      resizeSequenceIdRef.current += 1
      requestPanelResizeRef.current = () => {}
      clearHeightTween()
      if (scheduledMeasureFrameRef.current !== null) {
        window.cancelAnimationFrame(scheduledMeasureFrameRef.current)
      }
      if (scheduledResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(scheduledResizeFrameRef.current)
      }
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
    isPanelResizing,
  }
}
