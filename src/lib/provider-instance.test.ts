import { describe, expect, it } from "vitest"
import {
  providerInstanceKey,
  providerInstanceRef,
  sameProviderInstance,
} from "@/lib/provider-instance"

describe("provider instance identity", () => {
  it("uses a managed profile UUID as the account key", () => {
    const ref = providerInstanceRef("codex", { selectedAccountProfileId: " profile-a " })

    expect(ref).toEqual({ providerId: "codex", instanceId: "profile-a" })
    expect(providerInstanceKey(ref)).toBe("codex\u0000profile-a")
  })

  it("uses the same managed identity shape for Claude and Gemini", () => {
    expect(providerInstanceRef("claude", { selectedAccountProfileId: "claude-work" })).toEqual({
      providerId: "claude",
      instanceId: "claude-work",
    })
    expect(providerInstanceRef("gemini", { selectedAccountProfileId: "gemini-work" })).toEqual({
      providerId: "gemini",
      instanceId: "gemini-work",
    })
  })

  it("keeps unscoped providers keyed by provider ID", () => {
    const ref = providerInstanceRef("claude")

    expect(ref).toEqual({ providerId: "claude" })
    expect(providerInstanceKey(ref)).toBe("claude")
  })

  it("does not consider two managed profiles interchangeable", () => {
    expect(
      sameProviderInstance(
        { providerId: "codex", instanceId: "profile-a" },
        { providerId: "codex", instanceId: "profile-b" }
      )
    ).toBe(false)
  })
})
