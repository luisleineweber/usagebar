import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useProbeState } from "@/hooks/app/use-probe-state"

describe("useProbeState", () => {
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
        lines: [{ type: "badge", label: "Error", text: "Not signed in" }],
      })
    })

    expect(result.current.pluginStates.codex).toMatchObject({
      loading: false,
      error: "Not signed in",
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
