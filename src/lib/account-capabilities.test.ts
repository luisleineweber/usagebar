import { describe, expect, it } from "vitest"
import { getProviderAccountCapabilities } from "@/lib/account-capabilities"
import { getProviderSettingsDefinition } from "@/lib/provider-settings"

describe("provider account capabilities", () => {
  it("keeps managed switching on Codex, Claude, and Gemini", () => {
    expect(
      getProviderAccountCapabilities("codex", getProviderSettingsDefinition("codex"))
    ).toMatchObject({
      managedProfiles: true,
      ping: true,
      reauthenticate: true,
    })
    expect(
      getProviderAccountCapabilities("claude", getProviderSettingsDefinition("claude"))
    ).toMatchObject({
      managedProfiles: true,
      ping: true,
      removeCredential: true,
    })
    expect(
      getProviderAccountCapabilities("gemini", getProviderSettingsDefinition("gemini"))
    ).toMatchObject({
      managedProfiles: true,
      ping: true,
    })
  })
})
