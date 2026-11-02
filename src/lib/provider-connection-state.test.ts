import { describe, expect, it } from "vitest"
import {
  getProviderConnectionState,
  type ProviderConnectionProbeState,
} from "@/lib/provider-connection-state"
import type { PluginOutput } from "@/lib/plugin-types"

const data: PluginOutput = {
  providerId: "codex",
  displayName: "Codex",
  iconUrl: "/codex.svg",
  lines: [],
}

function probe(patch: Partial<ProviderConnectionProbeState> = {}): ProviderConnectionProbeState {
  return { data: null, error: null, loading: false, lastSettledError: null, ...patch }
}

function stateOf(state: ProviderConnectionProbeState, enabled = true, supported = true) {
  return getProviderConnectionState({ enabled, supported, state })
}

describe("getProviderConnectionState", () => {
  it("is connected only after a settled success", () => {
    expect(stateOf(probe())).toBe("setupNeeded")
    expect(stateOf(probe({ data }))).toBe("connected")
  })

  it("is error when a settled failure keeps earlier data", () => {
    expect(stateOf(probe({ data, error: "expired", lastSettledError: "expired" }))).toBe("error")
  })

  it("keeps the settled failure while a retry runs", () => {
    // setLoadingForPlugins clears `error` and keeps the earlier data during a refresh.
    expect(stateOf(probe({ data, loading: true, lastSettledError: "expired" }))).toBe("error")
  })

  it("keeps the settled success while a refresh runs", () => {
    expect(stateOf(probe({ data, loading: true }))).toBe("connected")
  })

  it("is setupNeeded while the first probe runs", () => {
    expect(stateOf(probe({ loading: true }))).toBe("setupNeeded")
  })

  it("separates unsupported from disabled", () => {
    expect(stateOf(probe(), true, false)).toBe("unsupported")
    expect(stateOf(probe(), false, false)).toBe("unsupported")
    expect(stateOf(probe({ data }), false, true)).toBe("disabled")
  })
})
