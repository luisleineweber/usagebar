import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useProbeState } from "@/hooks/app/use-probe-state"

describe("useProbeState", () => {
  it("rejects a late result from a previously selected provider account", () => {
    const { result, rerender } = renderHook(
      ({ instanceId }) =>
        useProbeState({
          onProbeResult: vi.fn(),
          providerInstanceRefs: {
            codex: { providerId: "codex", instanceId },
          },
        }),
      { initialProps: { instanceId: "profile-a" } }
    )

    act(() => {
      result.current.handleProbeResult({
        providerId: "codex",
        instanceRef: { providerId: "codex", instanceId: "profile-a" },
        displayName: "Codex A",
        iconUrl: "/codex.svg",
        lines: [{ type: "text", label: "Now", value: "A" }],
      })
    })

    rerender({ instanceId: "profile-b" })

    act(() => {
      result.current.handleProbeResult({
        providerId: "codex",
        instanceRef: { providerId: "codex", instanceId: "profile-a" },
        displayName: "Codex A",
        iconUrl: "/codex.svg",
        lines: [{ type: "text", label: "Now", value: "stale A" }],
      })
    })

    expect(result.current.pluginStates.codex.data?.displayName).toBe("Codex A")
    expect(result.current.pluginStates.codex.data?.lines[0]).toEqual({
      type: "text",
      label: "Now",
      value: "A",
    })

    act(() => {
      result.current.handleProbeResult({
        providerId: "codex",
        instanceRef: { providerId: "codex", instanceId: "profile-b" },
        displayName: "Codex B",
        iconUrl: "/codex.svg",
        lines: [{ type: "text", label: "Now", value: "B" }],
      })
    })

    expect(result.current.pluginStates.codex.data?.displayName).toBe("Codex B")
  })

  it("retains provider activity history when a later successful probe omits it", () => {
    const { result } = renderHook(() => useProbeState({ onProbeResult: vi.fn() }))
    const history = {
      version: 1 as const,
      source: "ccusage",
      timeZone: "system-local",
      entries: [
        {
          periodStart: "2026-07-28T22:00:00.000Z",
          periodEnd: "2026-07-29T22:00:00.000Z",
          totalTokens: 42,
        },
      ],
    }

    act(() => {
      result.current.handleProbeResult({
        providerId: "codex",
        displayName: "Codex",
        iconUrl: "/codex.svg",
        lines: [{ type: "progress", label: "Session", used: 7, limit: 100, format: "percent" }],
        history,
      })
    })

    act(() => {
      result.current.handleProbeResult({
        providerId: "codex",
        displayName: "Codex",
        iconUrl: "/codex.svg",
        lines: [{ type: "progress", label: "Session", used: 8, limit: 100, format: "percent" }],
      })
    })

    expect(result.current.pluginStates.codex.data?.history).toEqual(history)
    expect(result.current.pluginStates.codex.lastSettledData?.history).toEqual(history)
  })

  it("does not add unknown progress values to local quota history", () => {
    const { result } = renderHook(() => useProbeState({ onProbeResult: vi.fn() }))

    act(() => {
      result.current.handleProbeResult({
        providerId: "codex",
        displayName: "Codex",
        iconUrl: "/codex.svg",
        lines: [{ type: "progress", label: "Session", used: null, limit: 100, format: "percent" }],
      })
    })

    expect(result.current.pluginStates.codex.history).toBeUndefined()
  })

  it("preserves settled data while a loaded provider refreshes", () => {
    const { result } = renderHook(() => useProbeState({ onProbeResult: vi.fn() }))

    act(() => {
      result.current.handleProbeResult({
        providerId: "codex",
        displayName: "Codex",
        iconUrl: "/codex.svg",
        lines: [{ type: "text", label: "Now", value: "42%" }],
      })
    })

    act(() => {
      result.current.setLoadingForPlugins(["codex"])
    })

    expect(result.current.pluginStates.codex).toMatchObject({
      loading: true,
      error: null,
      data: {
        providerId: "codex",
        displayName: "Codex",
      },
      lastSettledData: {
        providerId: "codex",
        displayName: "Codex",
      },
    })
  })

  it("keeps retained content when a later probe returns an error badge", () => {
    const { result } = renderHook(() => useProbeState({ onProbeResult: vi.fn() }))

    act(() => {
      result.current.handleProbeResult({
        providerId: "codex",
        displayName: "Codex",
        iconUrl: "/codex.svg",
        lines: [{ type: "text", label: "Now", value: "42%" }],
      })
    })

    act(() => {
      result.current.handleProbeResult({
        providerId: "codex",
        displayName: "Codex",
        iconUrl: "/codex.svg",
        error: {
          category: "credentialExpired",
          message: "Not signed in",
        },
        lines: [{ type: "badge", label: "Error", text: "Not signed in" }],
      })
    })

    expect(result.current.pluginStates.codex).toMatchObject({
      loading: false,
      error: "Not signed in",
      errorCategory: "credentialExpired",
      data: {
        providerId: "codex",
        displayName: "Codex",
      },
      lastSettledData: {
        providerId: "codex",
        displayName: "Codex",
      },
    })
  })
})
