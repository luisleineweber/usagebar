import { describe, expect, it } from "vitest"
import { getProviderAccountCapabilities } from "@/lib/account-capabilities"
import { getProviderSettingsDefinition } from "@/lib/provider-settings"

describe("provider account capabilities", () => {
  it("keeps managed switching on Codex and exposes shared health actions", () => {
    expect(getProviderAccountCapabilities("codex", getProviderSettingsDefinition("codex"))).toMatchObject({
      managedProfiles: true,
      ping: true,
      reauthenticate: true,
    })
    expect(getProviderAccountCapabilities("claude", getProviderSettingsDefinition("claude"))).toMatchObject({
      managedProfiles: false,
      ping: true,
      removeCredential: true,
    })
  })
})
