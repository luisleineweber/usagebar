import { useState, useEffect, useCallback, useRef } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { isTauri } from "@tauri-apps/api/core"
import { check, type Update } from "@tauri-apps/plugin-updater"
import { openUrl } from "@tauri-apps/plugin-opener"
import { relaunch } from "@tauri-apps/plugin-process"
import { track } from "@/lib/analytics"

export type UpdateStatus =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "up-to-date" }
  | { status: "available"; version: string; url?: string }
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
  repo?: string
}

const DEFAULT_RELEASE_REPO = "Loues000/usagebar"

export function isPrereleaseVersion(version: string): boolean {
  return version.trim().includes("-")
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

export function isEligibleUpdateCandidate(candidateVersion: string, currentVersion: string): boolean {
  const candidate = parseVersion(candidateVersion)
  const current = parseVersion(currentVersion)
  const coreDelta = compareVersions(
    `${candidate.major}.${candidate.minor}.${candidate.patch}`,
    `${current.major}.${current.minor}.${current.patch}`,
  )

  if (coreDelta > 0) return true
  if (coreDelta < 0) return false

  if (candidate.prerelease && current.prerelease && candidate.channel !== current.channel) {
    return false
  }

  return compareVersions(candidateVersion, currentVersion) > 0
}

type GitHubRelease = {
  tag_name?: string
  html_url?: string
  draft?: boolean
}

type GitHubReleaseCandidate = {
  version: string
  url: string
}

async function findNewerGitHubRelease(
  repo: string,
  currentVersion: string,
): Promise<GitHubReleaseCandidate | null> {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=20`, {
    headers: { Accept: "application/vnd.github+json" },
  })
  if (!response.ok) {
    throw new Error(`GitHub release check failed with ${response.status}`)
  }

  const releases = (await response.json()) as GitHubRelease[]
  return releases
    .filter((release) => !release.draft && release.tag_name && release.html_url)
    .map((release) => ({
      version: normalizeVersion(release.tag_name ?? ""),
      url: release.html_url ?? "",
    }))
    .filter((release) => isEligibleUpdateCandidate(release.version, currentVersion))
    .sort((left, right) => compareVersions(right.version, left.version))[0] ?? null
}

export function useAppUpdate(options: UseAppUpdateOptions = {}): UseAppUpdateReturn {
  const isDev = options.isDev ?? import.meta.env.DEV
  const repo = options.repo ?? DEFAULT_RELEASE_REPO
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ status: "idle" })
  const statusRef = useRef<UpdateStatus>({ status: "idle" })
  const updateRef = useRef<Update | null>(null)
  const externalReleaseUrlRef = useRef<string | null>(null)
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
      const version = await getCurrentVersion()
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
  }, [getCurrentVersion, isDev])

  const setUpToDateThenIdle = useCallback(() => {
    setStatus({ status: "up-to-date" })
    upToDateTimeoutRef.current = window.setTimeout(() => {
      upToDateTimeoutRef.current = null
      if (mountedRef.current) setStatus({ status: "idle" })
    }, 3000)
  }, [setStatus])

  const checkForUpdates = useCallback(async () => {
    if (!isTauri() || isDev) return
    if (inFlightRef.current.checking || inFlightRef.current.downloading || inFlightRef.current.installing) return
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
      let update: Update | null = null
      let canUseSignedUpdater = updaterEnabledRef.current
      if (!updaterEligibilityResolvedRef.current) {
        canUseSignedUpdater = await resolveUpdaterEligibility()
      }

      if (canUseSignedUpdater) {
        update = await check()
      }
      if (!mountedRef.current) return
      if (update) {
        const updateVersion = normalizeVersion(update.version)
        if (isEligibleUpdateCandidate(updateVersion, currentVersion)) {
          inFlightRef.current.checking = false
          updateRef.current = update
          externalReleaseUrlRef.current = null
          setStatus({ status: "available", version: updateVersion })
          return
        }
        console.warn(`Ignoring updater candidate ${update.version}; current version is ${currentVersion}.`)
      }

      let release: GitHubReleaseCandidate | null = null
      try {
        release = await findNewerGitHubRelease(repo, currentVersion)
      } catch (error) {
        if (canUseSignedUpdater) {
          console.warn("GitHub release fallback failed after signed updater check:", error)
        } else {
          throw error
        }
      }
      if (!mountedRef.current) return
      inFlightRef.current.checking = false
      if (release) {
        updateRef.current = null
        externalReleaseUrlRef.current = release.url
        setStatus({ status: "available", version: release.version, url: release.url })
        return
      }

      setUpToDateThenIdle()
    } catch (err) {
      inFlightRef.current.checking = false
      if (!mountedRef.current) return
      console.error("Update check failed:", err)
      setStatus({ status: "error", message: "Update check failed" })
    }
  }, [getCurrentVersion, isDev, repo, resolveUpdaterEligibility, setStatus, setUpToDateThenIdle])

  useEffect(() => {
    mountedRef.current = true
    let intervalId: number | null = null

    void resolveUpdaterEligibility().then(() => {
      if (!mountedRef.current) return

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
    const releaseUrl = externalReleaseUrlRef.current
    if (statusRef.current.status === "available" && releaseUrl) {
      track("update_accepted", { version: statusRef.current.version })
      await openUrl(releaseUrl)
      return
    }

    if (!update) return
    if (statusRef.current.status === "available") {
      if (inFlightRef.current.downloading || inFlightRef.current.installing) return

      track("update_accepted", { version: update.version })
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
