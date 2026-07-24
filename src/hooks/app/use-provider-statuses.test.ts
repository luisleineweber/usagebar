import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { fetchProviderStatusMock, getProbeEligiblePluginIdsMock } = vi.hoisted(() => ({
  fetchProviderStatusMock: vi.fn(),
  getProbeEligiblePluginIdsMock: vi.fn(),
}))

vi.mock("@/lib/provider-status", () => ({
  fetchProviderStatus: fetchProviderStatusMock,
}))

vi.mock("@/lib/settings", () => ({
  getProbeEligiblePluginIds: getProbeEligiblePluginIdsMock,
}))

import { useProviderStatuses } from "@/hooks/app/use-provider-statuses"
import type { PluginMeta } from "@/lib/plugin-types"

const makePlugin = (overrides: Partial<PluginMeta> = {}): PluginMeta => ({
  id: "test",
  name: "Test Plugin",
  iconUrl: "/test.svg",
  brandColor: "#000",
  lines: [],
  primaryCandidates: [],
  statusPageUrl: "https://status.test.com",
  ...overrides,
})

describe("useProviderStatuses", () => {
  beforeEach(() => {
    vi.spyOn(window, "setInterval").mockImplementation((() => 1) as typeof setInterval)
    vi.spyOn(window, "clearInterval").mockImplementation(vi.fn())
    fetchProviderStatusMock.mockReset()
    getProbeEligiblePluginIdsMock.mockReset()
    getProbeEligiblePluginIdsMock.mockReturnValue(new Set<string>())
    fetchProviderStatusMock.mockResolvedValue(null)
  })

  it("returns empty object initially", () => {
    const { result } = renderHook(() =>
      useProviderStatuses({
        pluginsMeta: [],
        pluginSettings: null,
      })
    )
    expect(result.current).toEqual({})
  })

  it("returns empty when plugin has no statusPageUrl", () => {
    getProbeEligiblePluginIdsMock.mockReturnValue(new Set(["test"]))

    const { result } = renderHook(() =>
      useProviderStatuses({
        pluginsMeta: [makePlugin({ statusPageUrl: undefined })],
        pluginSettings: { order: ["test"], disabled: [] },
      })
    )
    expect(result.current).toEqual({})
  })

  it("calls fetchProviderStatus for eligible plugins", async () => {
    getProbeEligiblePluginIdsMock.mockReturnValue(new Set(["codex"]))
    fetchProviderStatusMock.mockResolvedValue({
      indicator: "none",
      description: null,
      updatedAt: null,
      checkedAt: 1,
    })

    renderHook(() =>
      useProviderStatuses({
        pluginsMeta: [makePlugin({ id: "codex", name: "Codex" })],
        pluginSettings: { order: ["codex"], disabled: [] },
      })
    )

    await waitFor(() => {
      expect(fetchProviderStatusMock).toHaveBeenCalledTimes(1)
    })
    expect(fetchProviderStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "codex", name: "Codex" })
    )
  })

  it("does not update state when fetch returns null", async () => {
    getProbeEligiblePluginIdsMock.mockReturnValue(new Set(["codex"]))
    fetchProviderStatusMock.mockResolvedValue(null)

    const { result } = renderHook(() =>
      useProviderStatuses({
        pluginsMeta: [makePlugin({ id: "codex", name: "Codex" })],
        pluginSettings: { order: ["codex"], disabled: [] },
      })
    )

    await waitFor(() => {
      expect(fetchProviderStatusMock).toHaveBeenCalled()
    })

    expect(result.current.codex).toBeUndefined()
  })

  it("calls fetchProviderStatus even when fetch rejects", async () => {
    getProbeEligiblePluginIdsMock.mockReturnValue(new Set(["codex"]))
    fetchProviderStatusMock.mockRejectedValue(new Error("network error"))

    renderHook(() =>
      useProviderStatuses({
        pluginsMeta: [makePlugin({ id: "codex", name: "Codex" })],
        pluginSettings: { order: ["codex"], disabled: [] },
      })
    )

    await waitFor(() => {
      expect(fetchProviderStatusMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "codex", name: "Codex" })
      )
    })
  })

  it("only fetches status for plugins marked eligible", async () => {
    getProbeEligiblePluginIdsMock.mockReturnValue(new Set(["codex"]))
    fetchProviderStatusMock.mockResolvedValue({
      indicator: "none",
      description: null,
      updatedAt: null,
      checkedAt: 1,
    })

    renderHook(() =>
      useProviderStatuses({
        pluginsMeta: [
          makePlugin({ id: "codex", name: "Codex" }),
          makePlugin({ id: "ollama", name: "Ollama" }),
        ],
        pluginSettings: { order: ["codex", "ollama"], disabled: [] },
      })
    )

    await waitFor(() => {
      expect(fetchProviderStatusMock).toHaveBeenCalledTimes(1)
    })
  })

  it("registers a periodic refresh interval", async () => {
    getProbeEligiblePluginIdsMock.mockReturnValue(new Set(["codex"]))
    fetchProviderStatusMock.mockResolvedValue({
      indicator: "none",
      description: null,
      updatedAt: null,
      checkedAt: 1,
    })

    renderHook(() =>
      useProviderStatuses({
        pluginsMeta: [makePlugin({ id: "codex", name: "Codex" })],
        pluginSettings: { order: ["codex"], disabled: [] },
      })
    )

    await waitFor(() => {
      expect(window.setInterval).toHaveBeenCalledWith(expect.any(Function), 5 * 60_000)
    })
  })
})
