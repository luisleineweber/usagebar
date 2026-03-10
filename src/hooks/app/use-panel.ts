import { useEffect, useRef, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { getCurrentWindow, PhysicalSize, currentMonitor } from "@tauri-apps/api/window"
import type { ActiveView } from "@/components/side-nav"

const PANEL_WIDTH = 400
const HOME_PANEL_MAX_HEIGHT_PX = 720
const DETAIL_PANEL_MAX_HEIGHT_PX = 860
const SETTINGS_PANEL_MAX_HEIGHT_PX = 980
const MAX_HEIGHT_FALLBACK_PX = 820
const MAX_HEIGHT_FRACTION_OF_MONITOR = 0.9
const PANEL_RESIZE_DURATION_MS = 160

export function panelMaxHeightForView(activeView: ActiveView): number {
  if (activeView === "settings") return SETTINGS_PANEL_MAX_HEIGHT_PX
  if (activeView === "home") return HOME_PANEL_MAX_HEIGHT_PX
  return DETAIL_PANEL_MAX_HEIGHT_PX
}

type UsePanelArgs = {
  activeView: ActiveView
  setActiveView: (view: ActiveView) => void
  showAbout: boolean
  setShowAbout: (value: boolean) => void
  displayPlugins: unknown[]
  onPanelFocus?: () => void
}

export function usePanel({
  activeView,
  setActiveView,
  showAbout,
  setShowAbout,
  displayPlugins,
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
  const resizeFrameRef = useRef<number | null>(null)
  const currentPanelHeightPxRef = useRef<number | null>(null)
  const maxPanelHeightPxRef = useRef<number | null>(null)

  const cancelResizeFrame = () => {
    if (resizeFrameRef.current === null) return
    if (typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(resizeFrameRef.current)
    } else {
      window.clearTimeout(resizeFrameRef.current)
    }
    resizeFrameRef.current = null
  }

  const requestPanelFrame = (callback: FrameRequestCallback) => {
    if (typeof window.requestAnimationFrame === "function") {
      return window.requestAnimationFrame(callback)
    }
    return window.setTimeout(() => callback(performance.now()), 16)
  }

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

    const applyHeight = (factor: number, width: number, logicalHeight: number) => {
      const roundedHeight = Math.max(1, Math.round(logicalHeight))
      currentPanelHeightPxRef.current = roundedHeight
      setPanelHeightPx((prev) => (prev === roundedHeight ? prev : roundedHeight))
      void Promise.resolve(
        currentWindow.setSize(new PhysicalSize(width, Math.ceil(roundedHeight * factor)))
      )
        .then(() => invoke("reposition_panel"))
        .catch((e) => {
          console.error("Failed to resize window:", e)
        })
    }

    const animateHeight = (factor: number, width: number, targetLogicalHeight: number) => {
      const roundedTargetHeight = Math.max(1, Math.round(targetLogicalHeight))
      const currentHeight = currentPanelHeightPxRef.current

      cancelResizeFrame()

      if (currentHeight === null || Math.abs(currentHeight - roundedTargetHeight) <= 1) {
        applyHeight(factor, width, roundedTargetHeight)
        return
      }

      const startHeight = currentHeight
      const startTime = performance.now()

      const step = (timestamp: number) => {
        if (isDisposed) return
        const progress = Math.min((timestamp - startTime) / PANEL_RESIZE_DURATION_MS, 1)
        const easedProgress = 1 - Math.pow(1 - progress, 3)
        const nextHeight =
          startHeight + ((roundedTargetHeight - startHeight) * easedProgress)

        applyHeight(factor, width, nextHeight)

        if (progress < 1) {
          resizeFrameRef.current = requestPanelFrame(step)
        } else {
          resizeFrameRef.current = null
        }
      }

      resizeFrameRef.current = requestPanelFrame(step)
    }

    const resizeWindow = async () => {
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
      const panelMaxHeightPx = panelMaxHeightForView(activeView)

      let maxHeightPhysical: number | null = null
      let maxHeightLogical: number | null = null

      try {
        const monitor = await currentMonitor()
        if (monitor) {
          maxHeightPhysical = Math.floor(
            Math.min(monitor.size.height * MAX_HEIGHT_FRACTION_OF_MONITOR, panelMaxHeightPx * factor)
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

      animateHeight(factor, width, Math.min(desiredHeightLogical, maxHeightLogical))
    }

    resizeWindow()

    const observer = new ResizeObserver(() => {
      resizeWindow()
    })
    observer.observe(container)

    return () => {
      isDisposed = true
      cancelResizeFrame()
      observer.disconnect()
    }
  }, [activeView, displayPlugins])

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
