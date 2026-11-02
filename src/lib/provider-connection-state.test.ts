import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { PluginState } from "@/hooks/app/types"
import { useProbeState } from "@/hooks/app/use-probe-state"
import type { PluginOutput } from "@/lib/plugin-types"
import { getProviderConnectionState } from "@/lib/provider-connection-state"

const data: PluginOutput = {
  providerId: "codex",
  displayName: "Codex",
  iconUrl: "/codex.svg",
  lines: [{ type: "text", label: "Now", value: "ok" }],
}

type ProbeState = Pick<PluginState, "data" | "error" | "loading" | "lastSettledError">

function probe(patch: Partial<ProbeState> = {}): ProbeState {
  return { data: null, error: null, loading: false, lastSettledError: undefined, ...patch }
}

function stateOf(state: ProbeState, enabled = true, supported = true) {
  return getProviderConnectionState({ enabled, supported, state })
}

describe("getProviderConnectionState", () => {
  it("is unsupported when the platform cannot run the provider, whether enabled or not", () => {
    expect(stateOf(probe({ data, lastSettledError: null }), true, false)).toBe("unsupported")
    expect(stateOf(probe(), false, false)).toBe("unsupported")
  })

  it("is disabled when the user turned the provider off, even with retained data", () => {
    expect(stateOf(probe({ data, lastSettledError: null }), false)).toBe("disabled")
  })

  it("is error after a settled failure, even with retained data", () => {
    expect(stateOf(probe({ data, error: "expired", lastSettledError: "expired" }))).toBe("error")
  })

  it("is connected after a settled success", () => {
    expect(stateOf(probe({ data, lastSettledError: null }))).toBe("connected")
  })

  it("is setupNeeded when no probe has settled", () => {
    expect(stateOf(probe())).toBe("setupNeeded")
    expect(stateOf(probe({ loading: true }))).toBe("setupNeeded")
  })

  it("stays connected while a refresh after a success is loading", () => {
    expect(stateOf(probe({ data, loading: true, lastSettledError: null }))).toBe("connected")
  })

  it("stays error while a retry after a failure is loading", () => {
    expect(stateOf(probe({ data, loading: true, lastSettledError: "expired" }))).toBe("error")
  })

  it("does not treat retained data as a connection when no settled probe is recorded", () => {
    expect(stateOf(probe({ data, loading: true, lastSettledError: undefined }))).toBe("setupNeeded")
  })

  it("follows success, failure, and retry through useProbeState", () => {
    const { result } = renderHook(() => useProbeState({ onProbeResult: vi.fn() }))
    const connection = () => stateOf(result.current.pluginStates.codex!)

    act(() => result.current.handleProbeResult(data))
    expect(connection()).toBe("connected")

    act(() =>
      result.current.handleProbeResult({
        ...data,
        lines: [{ type: "badge", label: "Error", text: "Codex login expired." }],
      })
    )
    expect(connection()).toBe("error")

    // The refresh clears `error` and keeps the earlier data; the retry must not look connected.
    act(() => result.current.setLoadingForPlugins(["codex"]))
    expect(result.current.pluginStates.codex).toMatchObject({
      loading: true,
      error: null,
      lastSettledError: "Codex login expired.",
    })
    expect(result.current.pluginStates.codex?.data).not.toBeNull()
    expect(connection()).toBe("error")

    act(() => result.current.handleProbeResult(data))
    expect(result.current.pluginStates.codex?.lastSettledError).toBeNull()
    expect(connection()).toBe("connected")
  })
})
