import { describe, expect, it } from "vitest"
import type { SetupDetection } from "@/lib/plugin-types"
import { getProviderSignIn } from "@/lib/provider-sign-in-state"

const checks = [
  { id: "claude-oauth", label: "Claude Code login", source: "Local file", description: "" },
  { id: "claude-env", label: "ANTHROPIC_API_KEY", source: "Environment", description: "" },
]

function signIn(patch: Partial<Parameters<typeof getProviderSignIn>[0]> = {}) {
  return getProviderSignIn({
    connectionState: "setupNeeded",
    errorCategory: null,
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
      signIn({ connectionState: "error", errorCategory: "providerResponse", detections: found })
    ).toEqual({ kind: "signedIn", sources: ["Claude Code login"] })
  })

  it("is signed out when the last check rejected the credential", () => {
    for (const errorCategory of [
      "credentialMissing",
      "credentialUnavailable",
      "credentialUnreadable",
      "credentialInvalid",
      "credentialExpired",
    ] as const) {
      expect(signIn({ connectionState: "error", errorCategory, detections: found })).toEqual({
        kind: "signedOut",
        credentialProblem: true,
      })
    }
  })

  it("is signed in with a stored app credential", () => {
    expect(signIn({ storedCredentialLabels: ["the stored Cookie header"] })).toEqual({
      kind: "signedIn",
      sources: ["the stored Cookie header"],
    })
  })

  it("is signed in after a successful check without other evidence", () => {
    expect(signIn({ connectionState: "connected", setupChecks: undefined })).toEqual({
      kind: "signedIn",
      sources: [],
    })
  })

  it("is signed out without any sign-in evidence", () => {
    expect(signIn()).toEqual({ kind: "signedOut", credentialProblem: false })
    expect(
      signIn({ detections: [{ id: "claude-oauth", state: "missing" }], connectionState: "error" })
    ).toEqual({ kind: "signedOut", credentialProblem: false })
  })
})
