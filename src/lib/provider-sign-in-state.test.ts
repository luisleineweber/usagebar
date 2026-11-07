import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useProbeState } from "@/hooks/app/use-probe-state"
import type { SetupDetection } from "@/lib/plugin-types"
import { getProviderSignIn } from "@/lib/provider-sign-in-state"

const checks = [
  { id: "claude-oauth", label: "Claude Code login", source: "Local file", description: "" },
  { id: "claude-env", label: "ANTHROPIC_API_KEY", source: "Environment", description: "" },
]

function signIn(patch: Partial<Parameters<typeof getProviderSignIn>[0]> = {}) {
  return getProviderSignIn({
    connectionState: "setupNeeded",
    settledErrorCategory: null,
    setupChecks: checks,
    detections: undefined,
    storedCredentialLabels: [],
    ...patch,
  })
}

const found: SetupDetection[] = [
  { id: "claude-oauth", state: "found" },
  { id: "claude-env", state: "missing" },
]

describe("getProviderSignIn", () => {
  it("is signed in with a found local sign-in, even when the last check failed", () => {
    // Example: Claude Code login found, but the usage request returned HTTP 429.
    expect(
      signIn({
        connectionState: "error",
        settledErrorCategory: "providerResponse",
        detections: found,
      })
    ).toEqual({ kind: "signedIn", sources: ["Claude Code login"] })
  })

  it("is signed out when the last check rejected the credential", () => {
    for (const settledErrorCategory of [
      "credentialMissing",
      "credentialUnavailable",
      "credentialUnreadable",
      "credentialInvalid",
      "credentialExpired",
    ] as const) {
      expect(signIn({ connectionState: "error", settledErrorCategory, detections: found })).toEqual(
        {
          kind: "signedOut",
          credentialProblem: true,
        }
      )
    }
  })

  it("is signed in with a stored app credential", () => {
    expect(signIn({ storedCredentialLabels: ["the stored Cookie header"] })).toEqual({
      kind: "signedIn",
      sources: ["the stored Cookie header"],
    })
  })

  it("does not treat usage data alone as a sign-in", () => {
    // Claude can return local ccusage history without OAuth or a web cookie.
    expect(
      signIn({
        connectionState: "connected",
        detections: [
          { id: "claude-oauth", state: "missing" },
          { id: "claude-env", state: "missing" },
        ],
      })
    ).toEqual({ kind: "unconfirmed" })
  })

  it("is signed out without any sign-in evidence", () => {
    expect(signIn()).toEqual({ kind: "signedOut", credentialProblem: false })
    expect(
      signIn({ detections: [{ id: "claude-oauth", state: "missing" }], connectionState: "error" })
    ).toEqual({ kind: "signedOut", credentialProblem: false })
  })
})

describe("useProbeState settled error category", () => {
  it("keeps the rejected-credential category through a retry, and clears it on success", () => {
    const { result } = renderHook(() => useProbeState({ onProbeResult: vi.fn() }))
    const base = { providerId: "claude", displayName: "Claude", iconUrl: "" }

    act(() => {
      result.current.handleProbeResult({
        ...base,
        lines: [{ type: "badge", label: "Error", text: "Session expired." }],
        error: { category: "credentialExpired", message: "Session expired." },
      })
    })
    act(() => {
      result.current.setLoadingForPlugins(["claude"])
    })
    expect(result.current.pluginStates.claude).toMatchObject({
      loading: true,
      errorCategory: null,
      lastSettledErrorCategory: "credentialExpired",
    })

    act(() => {
      result.current.setLoadingForPlugins(["claude"])
    })
    expect(result.current.pluginStates.claude?.lastSettledErrorCategory).toBe("credentialExpired")

    act(() => {
      result.current.handleProbeResult({ ...base, lines: [] })
    })
    expect(result.current.pluginStates.claude?.lastSettledErrorCategory).toBeNull()
  })
})
