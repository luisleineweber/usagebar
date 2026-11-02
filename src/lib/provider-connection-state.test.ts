import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { PluginState } from "@/hooks/app/types"
import { useProbeState } from "@/hooks/app/use-probe-state"
import type { PluginOutput } from "@/lib/plugin-types"
import { getProviderConnectionState } from "@/lib/provider-connection-state"

const output: PluginOutput = { providerId: "codex", displayName: "Codex", lines: [], iconUrl: "" }

type StateInput = Pick<PluginState, "data" | "error" | "loading" | "lastSettledError">

function stateOf(overrides: Partial<StateInput> = {}): StateInput {
  return { data: null, error: null, loading: false, lastSettledError: undefined, ...overrides }
}

function resolve(state: StateInput, enabled = true, supported = true) {
  return getProviderConnectionState({ enabled, supported, state })
}

describe("getProviderConnectionState", () => {
  it("reports Unsupported for providers that cannot run on this platform", () => {
    expect(resolve(stateOf(), true, false)).toBe("unsupported")
    expect(resolve(stateOf(), false, false)).toBe("unsupported")
  })

  it("reports Disabled from the enabled flag, even with retained data or errors", () => {
    expect(resolve(stateOf({ data: output, error: "x", lastSettledError: "x" }), false)).toBe(
      "disabled"
    )
  })

  it("reports Error when the last settled probe failed, even with retained data", () => {
    expect(resolve(stateOf({ data: output, error: "Not signed in" }))).toBe("error")
  })

  it("reports Connected only when a settled probe returned output", () => {
    expect(resolve(stateOf({ data: output, lastSettledError: null }))).toBe("connected")
  })

  it("reports Setup needed when an enabled provider has no probe output", () => {
    expect(resolve(stateOf())).toBe("setupNeeded")
  })

  describe("while a refresh is loading", () => {
    it("keeps Error after a failure, although data is retained and error is cleared", () => {
      expect(resolve(stateOf({ loading: true, data: output, lastSettledError: "Expired" }))).toBe(
        "error"
      )
    })

    it("keeps Connected when the last settled probe succeeded", () => {
      expect(resolve(stateOf({ loading: true, data: output, lastSettledError: null }))).toBe(
        "connected"
      )
    })

    it("does not treat retained data as a connection without a recorded settled probe", () => {
      expect(resolve(stateOf({ loading: true, data: output }))).toBe("setupNeeded")
    })
  })

  it("keeps the settled failure through success, failure, and retry in useProbeState", () => {
    const { result } = renderHook(() => useProbeState({ onProbeResult: vi.fn() }))
    const connectionState = () => resolve(result.current.pluginStates.codex!)
    const success: PluginOutput = {
      ...output,
      lines: [{ type: "text", label: "Now", value: "42%" }],
    }

    act(() => {
      result.current.handleProbeResult(success)
    })
    expect(result.current.pluginStates.codex?.lastSettledError).toBeNull()
    expect(connectionState()).toBe("connected")

    act(() => {
      result.current.handleProbeResult({
        ...success,
        lines: [{ type: "badge", label: "Error", text: "Not signed in" }],
      })
    })
    expect(connectionState()).toBe("error")

    act(() => {
      result.current.setLoadingForPlugins(["codex"])
    })
    // The refresh clears `error` and keeps the old data; the retry must not look connected.
    expect(result.current.pluginStates.codex).toMatchObject({
      loading: true,
      error: null,
      lastSettledError: "Not signed in",
      data: { providerId: "codex" },
    })
    expect(connectionState()).toBe("error")

    // A second refresh before the first settles keeps the same settled result.
    act(() => {
      result.current.setLoadingForPlugins(["codex"])
    })
    expect(connectionState()).toBe("error")

    act(() => {
      result.current.setErrorForPlugins(["codex"], "Probe failed")
    })
    expect(result.current.pluginStates.codex?.lastSettledError).toBe("Probe failed")

    act(() => {
      result.current.setLoadingForPlugins(["codex"])
    })
    act(() => {
      result.current.handleProbeResult(success)
    })
    expect(result.current.pluginStates.codex?.lastSettledError).toBeNull()
    expect(connectionState()).toBe("connected")
  })
})
