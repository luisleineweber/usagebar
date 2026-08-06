import { describe, expect, it } from "vitest"

import type { PluginMeta, PluginOutput } from "@/lib/plugin-types"
import { resolveTrayState } from "@/lib/tray-state"

const pluginsMeta: PluginMeta[] = [
  { id: "alpha", name: "Alpha", iconUrl: "", primaryCandidates: ["Session"], lines: [] },
  { id: "beta", name: "Beta", iconUrl: "", primaryCandidates: ["Session"], lines: [] },
  { id: "gamma", name: "Gamma", iconUrl: "", primaryCandidates: ["Session"], lines: [] },
]

function output(providerId: string, used: number, limit = 100, resetsAt = "2026-07-24T18:00:00Z"): PluginOutput {
  const meta = pluginsMeta.find((plugin) => plugin.id === providerId)
  return {
    providerId,
    displayName: meta?.name ?? providerId,
    iconUrl: "",
    lines: [
      {
        type: "progress",
        label: "Session",
        used,
        limit,
        format: { kind: "percent" },
        resetsAt,
      },
    ],
  }
}

function state(data: PluginOutput | null, error: string | null = null) {
  return {
    data,
    lastSettledData: data,
    loading: false,
    error,
    errorCategory: error ? ("providerResponse" as const) : null,
    lastManualRefreshAt: null,
    lastSuccessAt: data ? 1 : null,
  }
}

describe("resolveTrayState", () => {
  it("returns unknown instead of inventing zero when settings are unavailable", () => {
    expect(
      resolveTrayState({
        pluginsMeta,
        pluginSettings: null,
        pluginStates: {},
      })
    ).toMatchObject({ kind: "unknown", reason: "no-provider" })
  })

  it("uses the first provider in listing order on every view", () => {
    const result = resolveTrayState({
      pluginsMeta,
      pluginSettings: { order: ["alpha", "beta", "gamma"], disabled: [] },
      pluginStates: {
        alpha: state(output("alpha", 10)),
        beta: state(output("beta", 91)),
      },
    })

    expect(result).toMatchObject({
      kind: "value",
      providerId: "alpha",
      remainingPercentExact: 90,
    })
  })

  it("uses the preferred provider when the tray selection mode requests it", () => {
    const result = resolveTrayState({
      pluginsMeta,
      pluginSettings: { order: ["alpha", "beta"], disabled: [] },
      pluginStates: {
        alpha: state(output("alpha", 10)),
        beta: state(output("beta", 80)),
      },
      preferredProviderId: "beta",
    })

    expect(result).toMatchObject({
      kind: "value",
      providerId: "beta",
      remainingPercentExact: 20,
    })
  })

  it("keeps the first provider on History instead of becoming unknown", () => {
    const result = resolveTrayState({
      pluginsMeta,
      pluginSettings: { order: ["alpha", "beta"], disabled: [] },
      pluginStates: {
        alpha: state(output("alpha", 25)),
        beta: state(output("beta", 100)),
      },
    })

    expect(result).toMatchObject({
      kind: "value",
      providerId: "alpha",
      remainingPercentExact: 75,
    })
  })

  it("does not skip the first provider when it has no data", () => {
    const result = resolveTrayState({
      pluginsMeta,
      pluginSettings: { order: ["alpha", "beta", "gamma"], disabled: [] },
      pluginStates: {
        beta: state(output("beta", 90)),
        gamma: state(output("gamma", 20)),
      },
    })

    expect(result).toMatchObject({ kind: "unknown", providerId: "alpha", reason: "no-data" })
  })

  it("always computes remaining usage regardless of the global display mode", () => {
    const result = resolveTrayState({
      pluginsMeta,
      pluginSettings: { order: ["alpha"], disabled: [] },
      pluginStates: { alpha: state(output("alpha", 25)) },
    })

    expect(result).toMatchObject({ kind: "value", remainingPercentExact: 75 })
  })

  it("keeps a valid zero remaining value distinct from unknown", () => {
    const result = resolveTrayState({
      pluginsMeta,
      pluginSettings: { order: ["alpha"], disabled: [] },
      pluginStates: { alpha: state(output("alpha", 100)) },
    })

    expect(result).toMatchObject({ kind: "value", remainingPercentExact: 0 })
  })

  it("prioritizes an active error over retained data", () => {
    const result = resolveTrayState({
      pluginsMeta,
      pluginSettings: { order: ["alpha"], disabled: [] },
      pluginStates: { alpha: state(output("alpha", 25), "Could not refresh") },
    })

    expect(result).toMatchObject({
      kind: "error",
      providerId: "alpha",
      errorMessage: "Could not refresh",
      lastKnownRemainingPercentExact: 75,
      lastKnownResetsAt: "2026-07-24T18:00:00Z",
    })
  })

  it("falls back to errors before unknown providers on Home", () => {
    const result = resolveTrayState({
      pluginsMeta,
      pluginSettings: { order: ["alpha", "beta"], disabled: [] },
      pluginStates: { alpha: state(null, "Failed") },
    })

    expect(result).toMatchObject({ kind: "error", providerId: "alpha" })
  })

  it("treats a non-positive limit as unknown", () => {
    const result = resolveTrayState({
      pluginsMeta,
      pluginSettings: { order: ["alpha"], disabled: [] },
      pluginStates: { alpha: state(output("alpha", 1, 0)) },
    })

    expect(result).toMatchObject({ kind: "unknown", reason: "invalid-limit" })
  })
})
