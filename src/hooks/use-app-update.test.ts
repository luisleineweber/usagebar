import { renderHook, act, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach, afterAll } from "vitest"

const { checkMock, openUrlMock, relaunchMock } = vi.hoisted(() => ({
  checkMock: vi.fn(),
  openUrlMock: vi.fn(),
  relaunchMock: vi.fn(),
}))
const { getVersionMock } = vi.hoisted(() => ({
  getVersionMock: vi.fn(),
}))
const { trackMock } = vi.hoisted(() => ({
  trackMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: getVersionMock,
}))

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: checkMock,
}))

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openUrlMock,
}))

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: relaunchMock,
}))

vi.mock("@/lib/analytics", () => ({
  track: trackMock,
}))

import { compareVersions, isEligibleUpdateCandidate, useAppUpdate } from "@/hooks/use-app-update"

declare global {
  // eslint-disable-next-line no-var
  var isTauri: boolean | undefined
}

describe("useAppUpdate", () => {
  const originalIsTauri = globalThis.isTauri

  beforeEach(() => {
    checkMock.mockReset()
    openUrlMock.mockReset()
    relaunchMock.mockReset()
    getVersionMock.mockReset()
    trackMock.mockReset()
    getVersionMock.mockResolvedValue("1.0.0")
    checkMock.mockResolvedValue(null)
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => [],
    })))
    // `@tauri-apps/api/core` considers `globalThis.isTauri` the runtime flag.
    globalThis.isTauri = true
  })

  afterAll(() => {
    vi.unstubAllGlobals()
    if (originalIsTauri === undefined) {
      delete globalThis.isTauri
    } else {
      globalThis.isTauri = originalIsTauri
    }
  })

  it("starts checking on mount", async () => {
    checkMock.mockReturnValue(new Promise(() => {})) // never resolves
    const { result } = renderHook(() => useAppUpdate({ isDev: false }))
    await act(() => Promise.resolve())
    await act(() => Promise.resolve())
    expect(result.current.updateStatus).toEqual({ status: "checking" })
  })

  it("compares prerelease versions before stable releases", () => {
    expect(compareVersions("0.1.0-beta.7", "0.1.0-beta.6")).toBe(1)
    expect(compareVersions("0.1.0", "0.1.0-beta.7")).toBe(1)
    expect(compareVersions("0.1.0-beta.6", "0.1.0")).toBe(-1)
  })

  it("only treats same-channel prereleases, stable releases, or higher cores as eligible updates", () => {
    expect(isEligibleUpdateCandidate("0.1.0-alpha.2", "0.1.0-alpha.1")).toBe(true)
    expect(isEligibleUpdateCandidate("0.1.0", "0.1.0-alpha.1")).toBe(true)
    expect(isEligibleUpdateCandidate("0.1.1-beta.1", "0.1.0-alpha.1")).toBe(true)
    expect(isEligibleUpdateCandidate("0.1.0-beta.6", "0.1.0-alpha.1")).toBe(false)
    expect(isEligibleUpdateCandidate("0.1.0-alpha.1", "0.1.0-alpha.1")).toBe(false)
    expect(isEligibleUpdateCandidate("0.0.9", "0.1.0-alpha.1")).toBe(false)
  })

  it("skips updater checks in dev", async () => {
    const { result } = renderHook(() => useAppUpdate({ isDev: true }))

    await act(() => Promise.resolve())
    await act(() => Promise.resolve())

    expect(getVersionMock).not.toHaveBeenCalled()
    expect(checkMock).not.toHaveBeenCalled()
    expect(result.current.updateStatus).toEqual({ status: "idle" })
  })

  it("uses GitHub releases for prerelease versions", async () => {
    getVersionMock.mockResolvedValue("0.1.0-beta.5")
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          draft: false,
          tag_name: "v0.1.0-beta.6",
          html_url: "https://github.com/Loues000/usagebar/releases/tag/v0.1.0-beta.6",
        },
      ],
    } as Response)

    const { result } = renderHook(() => useAppUpdate({ isDev: false }))

    await waitFor(() => expect(result.current.updateStatus.status).toBe("available"))

    expect(getVersionMock).toHaveBeenCalledTimes(1)
    expect(checkMock).not.toHaveBeenCalled()
    expect(result.current.updateStatus).toEqual({
      status: "available",
      version: "0.1.0-beta.6",
      url: "https://github.com/Loues000/usagebar/releases/tag/v0.1.0-beta.6",
    })
  })

  it("opens the GitHub release page for prerelease updates", async () => {
    getVersionMock.mockResolvedValue("0.1.0-beta.5")
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          draft: false,
          tag_name: "v0.1.0-beta.6",
          html_url: "https://github.com/Loues000/usagebar/releases/tag/v0.1.0-beta.6",
        },
      ],
    } as Response)

    const { result } = renderHook(() => useAppUpdate({ isDev: false }))
    await waitFor(() => expect(result.current.updateStatus.status).toBe("available"))

    await act(() => result.current.triggerInstall())
    expect(openUrlMock).toHaveBeenCalledWith("https://github.com/Loues000/usagebar/releases/tag/v0.1.0-beta.6")
    expect(trackMock).toHaveBeenCalledWith("update_accepted", { version: "0.1.0-beta.6" })
  })

  it("clears a pending up-to-date timeout on re-check", async () => {
    vi.useFakeTimers()
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout")

    // First check: no update -> schedules up-to-date timeout.
    checkMock.mockResolvedValueOnce(null)
    // Second check: hang so we can observe "checking".
    let resolveSecond: ((value: null) => void) | undefined
    checkMock.mockReturnValueOnce(new Promise<null>((resolve) => { resolveSecond = resolve }))

    const { result } = renderHook(() => useAppUpdate({ isDev: false }))
    await act(() => Promise.resolve())
    await act(() => Promise.resolve())
    expect(result.current.updateStatus).toEqual({ status: "up-to-date" })

    act(() => { void result.current.checkForUpdates() })
    await act(() => Promise.resolve())
    expect(clearTimeoutSpy).toHaveBeenCalled()
    expect(result.current.updateStatus).toEqual({ status: "checking" })

    // Cleanup: resolve second check so the hook can settle.
    resolveSecond?.(null)
    await act(() => Promise.resolve())

    clearTimeoutSpy.mockRestore()
    vi.useRealTimers()
  })

  it("waits for user action before downloading a signed Tauri update", async () => {
    const downloadMock = vi.fn(async (onEvent: (event: any) => void) => {
      onEvent({ event: "Started", data: { contentLength: 1000 } })
      onEvent({ event: "Progress", data: { chunkLength: 500 } })
      onEvent({ event: "Progress", data: { chunkLength: 500 } })
      onEvent({ event: "Finished", data: {} })
    })
    checkMock.mockResolvedValue({ version: "1.1.0", download: downloadMock, install: vi.fn() })

    const { result } = renderHook(() => useAppUpdate({ isDev: false }))
    await waitFor(() => expect(result.current.updateStatus.status).toBe("available"))

    expect(result.current.updateStatus).toEqual({ status: "available", version: "1.1.0" })
    expect(downloadMock).not.toHaveBeenCalled()

    await act(() => result.current.triggerInstall())
    expect(downloadMock).toHaveBeenCalled()
    expect(result.current.updateStatus).toEqual({ status: "ready" })
  })

  it("ignores older same-core beta releases for an alpha build", async () => {
    getVersionMock.mockResolvedValue("0.1.0-alpha.1")
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          draft: false,
          tag_name: "v0.1.0-beta.6",
          html_url: "https://github.com/Loues000/usagebar/releases/tag/v0.1.0-beta.6",
        },
      ],
    } as Response)

    const { result } = renderHook(() => useAppUpdate({ isDev: false }))

    await waitFor(() => expect(result.current.updateStatus.status).toBe("up-to-date"))

    expect(checkMock).not.toHaveBeenCalled()
    expect(result.current.updateStatus).toEqual({ status: "up-to-date" })
  })

  it("ignores signed updater candidates that are equal to the current version", async () => {
    getVersionMock.mockResolvedValue("1.0.0")
    checkMock.mockResolvedValue({ version: "1.0.0", download: vi.fn(), install: vi.fn() })

    const { result } = renderHook(() => useAppUpdate({ isDev: false }))
    await waitFor(() => expect(result.current.updateStatus.status).toBe("up-to-date"))

    expect(result.current.updateStatus).toEqual({ status: "up-to-date" })
  })

  it("ignores signed updater candidates that are lower than the current version", async () => {
    getVersionMock.mockResolvedValue("1.0.0")
    checkMock.mockResolvedValue({ version: "0.9.9", download: vi.fn(), install: vi.fn() })

    const { result } = renderHook(() => useAppUpdate({ isDev: false }))
    await waitFor(() => expect(result.current.updateStatus.status).toBe("up-to-date"))

    expect(result.current.updateStatus).toEqual({ status: "up-to-date" })
  })

  it("keeps stable signed updater checks up-to-date when GitHub fallback fails", async () => {
    getVersionMock.mockResolvedValue("1.0.0")
    checkMock.mockResolvedValue(null)
    vi.mocked(fetch).mockRejectedValueOnce(new Error("rate limited"))

    const { result } = renderHook(() => useAppUpdate({ isDev: false }))
    await waitFor(() => expect(result.current.updateStatus.status).toBe("up-to-date"))

    expect(checkMock).toHaveBeenCalled()
    expect(result.current.updateStatus).toEqual({ status: "up-to-date" })
  })

  it("does not check again when already ready", async () => {
    const downloadMock = vi.fn(async (onEvent: (event: any) => void) => {
      onEvent({ event: "Finished", data: {} })
    })
    checkMock.mockResolvedValue({ version: "1.1.0", download: downloadMock, install: vi.fn() })

    const { result } = renderHook(() => useAppUpdate({ isDev: false }))
    await act(() => Promise.resolve())
    await act(() => Promise.resolve())
    expect(result.current.updateStatus.status).toBe("available")

    checkMock.mockClear()
    await act(() => result.current.checkForUpdates())
    expect(checkMock).not.toHaveBeenCalled()
  })

  it("shows up-to-date then returns to idle when check returns null", async () => {
    vi.useFakeTimers()
    checkMock.mockResolvedValue(null)
    const { result } = renderHook(() => useAppUpdate({ isDev: false }))
    await act(() => Promise.resolve())
    await act(() => Promise.resolve())
    expect(result.current.updateStatus).toEqual({ status: "up-to-date" })
    await act(async () => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current.updateStatus).toEqual({ status: "idle" })
    vi.useRealTimers()
  })

  it("transitions to error when check throws", async () => {
    checkMock.mockRejectedValue(new Error("network error"))
    const { result } = renderHook(() => useAppUpdate({ isDev: false }))
    await act(() => Promise.resolve())
    await act(() => Promise.resolve())
    expect(result.current.updateStatus).toEqual({ status: "error", message: "Update check failed" })
  })

  it("reports indeterminate progress when content length is unknown", async () => {
    let resolveDownload: (() => void) | null = null
    const downloadMock = vi.fn((onEvent: (event: any) => void) => {
      onEvent({ event: "Started", data: { contentLength: null } })
      return new Promise<void>((resolve) => { resolveDownload = resolve })
    })
    checkMock.mockResolvedValue({ version: "1.1.0", download: downloadMock, install: vi.fn() })

    const { result } = renderHook(() => useAppUpdate({ isDev: false }))
    await waitFor(() => expect(result.current.updateStatus.status).toBe("available"))
    act(() => { void result.current.triggerInstall() })
    await waitFor(() => expect(result.current.updateStatus.status).toBe("downloading"))

    expect(result.current.updateStatus).toEqual({ status: "downloading", progress: -1 })

    // Clean up: resolve the download
    await act(async () => { resolveDownload?.() })
  })

  it("transitions to error on download failure", async () => {
    const downloadMock = vi.fn().mockRejectedValue(new Error("download failed"))
    checkMock.mockResolvedValue({ version: "1.1.0", download: downloadMock, install: vi.fn() })

    const { result } = renderHook(() => useAppUpdate({ isDev: false }))
    await waitFor(() => expect(result.current.updateStatus.status).toBe("available"))
    await act(() => result.current.triggerInstall())

    expect(result.current.updateStatus).toEqual({ status: "error", message: "Download failed" })
  })

  it("installs and relaunches when ready", async () => {
    const installMock = vi.fn().mockResolvedValue(undefined)
    const downloadMock = vi.fn(async (onEvent: (event: any) => void) => {
      onEvent({ event: "Finished", data: {} })
    })
    relaunchMock.mockResolvedValue(undefined)
    checkMock.mockResolvedValue({ version: "1.1.0", download: downloadMock, install: installMock })

    const { result } = renderHook(() => useAppUpdate({ isDev: false }))
    await waitFor(() => expect(result.current.updateStatus.status).toBe("available"))
    await act(() => result.current.triggerInstall())
    expect(result.current.updateStatus.status).toBe("ready")

    await act(() => result.current.triggerInstall())
    expect(installMock).toHaveBeenCalled()
    expect(relaunchMock).toHaveBeenCalled()
    expect(result.current.updateStatus).toEqual({ status: "idle" })
  })

  it("transitions to error on install failure", async () => {
    const installMock = vi.fn().mockRejectedValue(new Error("install failed"))
    const downloadMock = vi.fn(async (onEvent: (event: any) => void) => {
      onEvent({ event: "Finished", data: {} })
    })
    checkMock.mockResolvedValue({ version: "1.1.0", download: downloadMock, install: installMock })

    const { result } = renderHook(() => useAppUpdate({ isDev: false }))
    await waitFor(() => expect(result.current.updateStatus.status).toBe("available"))
    await act(() => result.current.triggerInstall())

    await act(() => result.current.triggerInstall())
    expect(result.current.updateStatus).toEqual({ status: "error", message: "Install failed" })
  })

  it("does not update state after unmount during check", async () => {
    const resolveRef: { current: ((val: any) => void) | null } = { current: null }
    checkMock.mockReturnValue(new Promise((resolve) => { resolveRef.current = resolve }))

    const { result, unmount } = renderHook(() => useAppUpdate({ isDev: false }))
    const statusAtUnmount = result.current.updateStatus
    unmount()
    resolveRef.current?.({ version: "1.0.0", download: vi.fn(), install: vi.fn() })
    await act(() => Promise.resolve())
    expect(result.current.updateStatus).toEqual(statusAtUnmount)
  })

  it("does not trigger install when not in ready state", async () => {
    vi.useFakeTimers()
    checkMock.mockResolvedValue(null)
    const { result } = renderHook(() => useAppUpdate({ isDev: false }))
    await act(() => Promise.resolve())
    await act(() => Promise.resolve())

    await act(() => result.current.triggerInstall())
    // Install ignored (we're not ready)
    expect(result.current.updateStatus).toEqual({ status: "up-to-date" })
    vi.useRealTimers()
  })

  it("does not trigger install while downloading", async () => {
    let resolveDownload: (() => void) | null = null
    const installMock = vi.fn().mockResolvedValue(undefined)
    const downloadMock = vi.fn((onEvent: (event: any) => void) => {
      onEvent({ event: "Started", data: { contentLength: 100 } })
      return new Promise<void>((resolve) => { resolveDownload = resolve })
    })
    checkMock.mockResolvedValue({ version: "1.1.0", download: downloadMock, install: installMock })

    const { result } = renderHook(() => useAppUpdate({ isDev: false }))
    await waitFor(() => expect(result.current.updateStatus.status).toBe("available"))
    act(() => { void result.current.triggerInstall() })
    await act(() => Promise.resolve())
    expect(result.current.updateStatus.status).toBe("downloading")

    await act(() => result.current.triggerInstall())
    expect(installMock).not.toHaveBeenCalled()

    // Cleanup: resolve download
    await act(async () => { resolveDownload?.() })
  })

  it("prevents concurrent install attempts", async () => {
    let resolveInstall: (() => void) | null = null
    const installMock = vi.fn(() => new Promise<void>((resolve) => { resolveInstall = resolve }))
    const downloadMock = vi.fn(async (onEvent: (event: any) => void) => {
      onEvent({ event: "Finished", data: {} })
    })
    relaunchMock.mockResolvedValue(undefined)
    checkMock.mockResolvedValue({ version: "1.1.0", download: downloadMock, install: installMock })

    const { result } = renderHook(() => useAppUpdate({ isDev: false }))
    await waitFor(() => expect(result.current.updateStatus.status).toBe("available"))
    await act(() => result.current.triggerInstall())

    act(() => { void result.current.triggerInstall() })
    act(() => { void result.current.triggerInstall() })
    await act(() => Promise.resolve())

    expect(result.current.updateStatus).toEqual({ status: "installing" })
    expect(installMock).toHaveBeenCalledTimes(1)

    await act(async () => { resolveInstall?.() })
  })
})
