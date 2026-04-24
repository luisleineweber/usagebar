import { useState, useEffect, useCallback, useRef } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { isTauri } from "@tauri-apps/api/core"
import { check, type Update } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"
import { track } from "@/lib/analytics"

export type UpdateStatus =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "up-to-date" }
  | { status: "downloading"; progress: number } // 0-100, or -1 if indeterminate
  | { status: "installing" }
  | { status: "ready" }
  | { status: "error"; message: string }

interface UseAppUpdateReturn {
  updateStatus: UpdateStatus
  triggerInstall: () => void
  checkForUpdates: () => void
}

interface UseAppUpdateOptions {
  isDev?: boolean
}

export function isPrereleaseVersion(version: string): boolean {
  return version.trim().includes("-")
}

export function useAppUpdate(options: UseAppUpdateOptions = {}): UseAppUpdateReturn {
  const isDev = options.isDev ?? import.meta.env.DEV
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ status: "idle" })
  const statusRef = useRef<UpdateStatus>({ status: "idle" })
  const updateRef = useRef<Update | null>(null)
  const mountedRef = useRef(true)
  const inFlightRef = useRef({ checking: false, downloading: false, installing: false })
  const upToDateTimeoutRef = useRef<number | null>(null)
  const updaterEnabledRef = useRef(false)
  const updaterEligibilityResolvedRef = useRef(false)

  const setStatus = useCallback((next: UpdateStatus) => {
    statusRef.current = next
    if (!mountedRef.current) return
    setUpdateStatus(next)
  }, [])

  const resolveUpdaterEligibility = useCallback(async () => {
    if (!isTauri() || isDev) {
      updaterEnabledRef.current = false
      updaterEligibilityResolvedRef.current = true
      return false
    }

    try {
      const version = await getVersion()
      const enabled = !isPrereleaseVersion(version)
      updaterEnabledRef.current = enabled
      updaterEligibilityResolvedRef.current = true
      return enabled
    } catch (err) {
      console.error("Failed to get app version for updater:", err)
      updaterEnabledRef.current = true
      updaterEligibilityResolvedRef.current = true
      return true
    }
  }, [isDev])

  const checkForUpdates = useCallback(async () => {
    if (!isTauri() || isDev) return
    if (!updaterEligibilityResolvedRef.current) {
      const enabled = await resolveUpdaterEligibility()
      if (!enabled) return
    }
    if (!updaterEnabledRef.current) return
    if (inFlightRef.current.checking || inFlightRef.current.downloading || inFlightRef.current.installing) return
    if (statusRef.current.status === "ready") return

    // Clear any pending up-to-date timeout
    if (upToDateTimeoutRef.current !== null) {
      clearTimeout(upToDateTimeoutRef.current)
      upToDateTimeoutRef.current = null
    }
    inFlightRef.current.checking = true
    setStatus({ status: "checking" })
    try {
      const update = await check()
      inFlightRef.current.checking = false
      if (!mountedRef.current) return
      if (!update) {
        setStatus({ status: "up-to-date" })
        upToDateTimeoutRef.current = window.setTimeout(() => {
          upToDateTimeoutRef.current = null
          if (mountedRef.current) setStatus({ status: "idle" })
        }, 3000)
        return
      }
      if (update) {
        updateRef.current = update
        inFlightRef.current.downloading = true
        setStatus({ status: "downloading", progress: -1 })

        let totalBytes: number | null = null
        let downloadedBytes = 0

        try {
          await update.download((event) => {
            if (!mountedRef.current) return
            if (event.event === "Started") {
              totalBytes = event.data.contentLength ?? null
              downloadedBytes = 0
              setStatus({
                status: "downloading",
                progress: totalBytes ? 0 : -1,
              })
            } else if (event.event === "Progress") {
              downloadedBytes += event.data.chunkLength
              if (totalBytes && totalBytes > 0) {
                const pct = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
                setStatus({ status: "downloading", progress: pct })
              }
            } else if (event.event === "Finished") {
              setStatus({ status: "ready" })
            }
          })
          setStatus({ status: "ready" })
        } catch (err) {
          console.error("Update download failed:", err)
          setStatus({ status: "error", message: "Download failed" })
        } finally {
          inFlightRef.current.downloading = false
        }
      }
    } catch (err) {
      inFlightRef.current.checking = false
      if (!mountedRef.current) return
      console.error("Update check failed:", err)
      setStatus({ status: "error", message: "Update check failed" })
    }
  }, [isDev, resolveUpdaterEligibility, setStatus])

  useEffect(() => {
    mountedRef.current = true
    let intervalId: number | null = null

    void resolveUpdaterEligibility().then((enabled) => {
      if (!enabled || !mountedRef.current) return

      void checkForUpdates()

      intervalId = window.setInterval(() => {
        void checkForUpdates()
      }, 15 * 60 * 1000)
    })

    return () => {
      mountedRef.current = false
      if (intervalId !== null) {
        clearInterval(intervalId)
      }
      if (upToDateTimeoutRef.current !== null) {
        clearTimeout(upToDateTimeoutRef.current)
      }
    }
  }, [checkForUpdates, resolveUpdaterEligibility])

  const triggerInstall = useCallback(async () => {
    const update = updateRef.current
    if (!update) return
    if (statusRef.current.status !== "ready") return
    if (inFlightRef.current.installing || inFlightRef.current.downloading) return

    track("update_accepted", { version: update.version })

    try {
      inFlightRef.current.installing = true
      setStatus({ status: "installing" })
      await update.install()
      await relaunch()
      setStatus({ status: "idle" })
    } catch (err) {
      console.error("Update install failed:", err)
      setStatus({ status: "error", message: "Install failed" })
    } finally {
      inFlightRef.current.installing = false
    }
  }, [setStatus])

  return { updateStatus, triggerInstall, checkForUpdates }
}
