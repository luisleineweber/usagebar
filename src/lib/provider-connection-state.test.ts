import { describe, expect, it } from "vitest"
import type { PluginOutput } from "@/lib/plugin-types"
import { getProviderConnectionState } from "@/lib/provider-connection-state"

const output: PluginOutput = { providerId: "codex", displayName: "Codex", lines: [], iconUrl: "" }

describe("getProviderConnectionState", () => {
  it("reports Disabled from the enabled flag, even with retained data or errors", () => {
    expect(
      getProviderConnectionState({
        enabled: false,
        supported: true,
        state: { data: output, error: "x" },
      })
    ).toBe("disabled")
  })

  it("reports Disabled for providers that cannot run on this platform", () => {
    expect(
      getProviderConnectionState({
        enabled: true,
        supported: false,
        state: { data: null, error: null },
      })
    ).toBe("disabled")
  })

  it("reports Error when the latest probe failed, even with retained data", () => {
    expect(
      getProviderConnectionState({
        enabled: true,
        supported: true,
        state: { data: output, error: "Not signed in" },
      })
    ).toBe("error")
  })

  it("reports Connected only when a probe returned output", () => {
    expect(
      getProviderConnectionState({
        enabled: true,
        supported: true,
        state: { data: output, error: null },
      })
    ).toBe("connected")
  })

  it("reports Setup needed when an enabled provider has no probe output", () => {
    expect(
      getProviderConnectionState({
        enabled: true,
        supported: true,
        state: { data: null, error: null },
      })
    ).toBe("setupNeeded")
  })
})
