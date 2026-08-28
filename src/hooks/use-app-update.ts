import { useState, useEffect, useCallback, useRef } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { isTauri } from "@tauri-apps/api/core"
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"

export type UpdateStatus =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "up-to-date" }
  | { status: "available"; version: string; error?: string }
  | { status: "downloading"; progress: number } // 0-100, or -1 if indeterminate
  | { status: "installing" }
  | { status: "ready" }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string }

interface UseAppUpdateReturn {
  updateStatus: UpdateStatus
  triggerInstall: () => void
  checkForUpdates: () => void
}
interface UseAppUpdateOptions {
  isDev?: boolean
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "")
}

function parseVersion(version: string) {
  const normalized = normalizeVersion(version)
  const [core = "", prerelease = ""] = normalized.split("-", 2)
  const [major = "0", minor = "0", patch = "0"] = core.split(".")
  const [channel = ""] = prerelease.split(".", 1)
  return {
    major: Number.parseInt(major, 10) || 0,
    minor: Number.parseInt(minor, 10) || 0,
    patch: Number.parseInt(patch, 10) || 0,
    prerelease,
    channel,
  }
}

function comparePrerelease(left: string, right: string): number {
  if (!left && !right) return 0
  if (!left) return 1
  if (!right) return -1

  const leftParts = left.split(".")
  const rightParts = right.split(".")
  const maxLength = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index]
    const rightPart = rightParts[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue

    const leftNumber = Number.parseInt(leftPart, 10)
    const rightNumber = Number.parseInt(rightPart, 10)
    const leftIsNumber = String(leftNumber) === leftPart
    const rightIsNumber = String(rightNumber) === rightPart
    if (leftIsNumber && rightIsNumber) return Math.sign(leftNumber - rightNumber)
    if (leftIsNumber) return -1
    if (rightIsNumber) return 1
    return leftPart.localeCompare(rightPart)
  }

  return 0
}

export function compareVersions(left: string, right: string): number {
  const parsedLeft = parseVersion(left)
  const parsedRight = parseVersion(right)
  for (const key of ["major", "minor", "patch"] as const) {
    const delta = parsedLeft[key] - parsedRight[key]
    if (delta !== 0) return Math.sign(delta)
  }
  return comparePrerelease(parsedLeft.prerelease, parsedRight.prerelease)
}

export function isEligibleUpdateCandidate(
  candidateVersion: string,
  currentVersion: string
): boolean {
  const candidate = parseVersion(candidateVersion)
  const current = parseVersion(currentVersion)
  const coreDelta = compareVersions(
    `${candidate.major}.${candidate.minor}.${candidate.patch}`,
    `${current.major}.${current.minor}.${current.patch}`
  )

  if (coreDelta > 0) return true
  if (coreDelta < 0) return false

  if (candidate.prerelease && current.prerelease && candidate.channel !== current.channel) {
    return false
  }

  return compareVersions(candidateVersion, currentVersion) > 0
}

export function useAppUpdate(options: UseAppUpdateOptions = {}): UseAppUpdateReturn {
  const isDev = options.isDev ?? import.meta.env.DEV
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ status: "idle" })
  const statusRef = useRef<UpdateStatus>({ status: "idle" })
  const updateRef = useRef<Update | null>(null)
  const currentVersionRef = useRef<string | null>(null)
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

  const getCurrentVersion = useCallback(async () => {
    if (currentVersionRef.current) return currentVersionRef.current
    const version = await getVersion()
    currentVersionRef.current = normalizeVersion(version)
    return currentVersionRef.current
  }, [])

  const resolveUpdaterEligibility = useCallback(async () => {
    if (!isTauri() || isDev) {
      updaterEnabledRef.current = false
      updaterEligibilityResolvedRef.current = true
      return false
    }

    try {
      await getCurrentVersion()
      updaterEnabledRef.current = true
      updaterEligibilityResolvedRef.current = true
      return true
    } catch (err) {
      console.error("Failed to get app version for updater:", err)
      updaterEnabledRef.current = true
      updaterEligibilityResolvedRef.current = true
      return true
    }
  }, [getCurrentVersion, isDev])

  const setUpToDateThenIdle = useCallback(() => {
    setStatus({ status: "up-to-date" })
    upToDateTimeoutRef.current = window.setTimeout(() => {
      upToDateTimeoutRef.current = null
      if (mountedRef.current) setStatus({ status: "idle" })
    }, 3000)
  }, [setStatus])

  const setUnavailableThenIdle = useCallback(
    (message: string) => {
      if (upToDateTimeoutRef.current !== null) {
        clearTimeout(upToDateTimeoutRef.current)
      }
      setStatus({ status: "unavailable", message })
      upToDateTimeoutRef.current = window.setTimeout(() => {
        upToDateTimeoutRef.current = null
        if (mountedRef.current) setStatus({ status: "idle" })
      }, 5000)
    },
    [setStatus]
  )

  const checkForUpdates = useCallback(async () => {
    if (!isTauri() || isDev) {
      setUnavailableThenIdle(
        isDev ? "Updates unavailable in development" : "Updates unavailable outside the app"
      )
      return
    }
    if (
      inFlightRef.current.checking ||
      inFlightRef.current.downloading ||
      inFlightRef.current.installing
    )
      return
    if (statusRef.current.status === "ready" || statusRef.current.status === "available") return

    // Clear any pending up-to-date timeout
    if (upToDateTimeoutRef.current !== null) {
      clearTimeout(upToDateTimeoutRef.current)
      upToDateTimeoutRef.current = null
    }
    inFlightRef.current.checking = true
    setStatus({ status: "checking" })
    try {
      const currentVersion = await getCurrentVersion()
      let canUseSignedUpdater = updaterEnabledRef.current
      if (!updaterEligibilityResolvedRef.current) {
        canUseSignedUpdater = await resolveUpdaterEligibility()
      }

      const update = canUseSignedUpdater ? await check() : null
      if (!mountedRef.current) return
      if (update) {
        const updateVersion = normalizeVersion(update.version)
        if (isEligibleUpdateCandidate(updateVersion, currentVersion)) {
          inFlightRef.current.checking = false
          updateRef.current = update
          setStatus({ status: "available", version: updateVersion })
          return
        }
        console.warn(
          `Ignoring updater candidate ${update.version}; current version is ${currentVersion}.`
        )
      }

      inFlightRef.current.checking = false
      setUpToDateThenIdle()
    } catch (err) {
      inFlightRef.current.checking = false
      if (!mountedRef.current) return
      console.error("Update check failed:", err)
      setStatus({ status: "error", message: "Update check failed" })
    }
  }, [
    getCurrentVersion,
    isDev,
    resolveUpdaterEligibility,
    setStatus,
    setUnavailableThenIdle,
    setUpToDateThenIdle,
  ])

  useEffect(() => {
    mountedRef.current = true
    let intervalId: number | null = null

    void resolveUpdaterEligibility().then(() => {
      if (!mountedRef.current) return

      void checkForUpdates()

      intervalId = window.setInterval(
        () => {
          void checkForUpdates()
        },
        15 * 60 * 1000
      )
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
    if (statusRef.current.status === "available") {
      if (inFlightRef.current.downloading || inFlightRef.current.installing) return

      inFlightRef.current.downloading = true
      setStatus({ status: "downloading", progress: -1 })

      let totalBytes: number | null = null
      let downloadedBytes = 0
      const onDownloadEvent = (event: DownloadEvent) => {
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
        } else if (event.event === "Finished" && totalBytes) {
          setStatus({ status: "downloading", progress: 100 })
        }
      }

      try {
        await update.download(onDownloadEvent)
        setStatus({ status: "ready" })
      } catch (err) {
        console.error("Update download failed:", err)
        setStatus({
          status: "available",
          version: normalizeVersion(update.version),
          error: "Download failed",
        })
      } finally {
        inFlightRef.current.downloading = false
      }
      return
    }

    if (statusRef.current.status !== "ready") return
    if (inFlightRef.current.installing || inFlightRef.current.downloading) return

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
