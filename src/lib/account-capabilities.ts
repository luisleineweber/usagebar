import type { ProviderSettingsDefinition } from "@/lib/provider-settings"

export type ProviderAccountCapabilities = {
  managedProfiles: boolean
  ping: boolean
  reauthenticate: boolean
  removeCredential: boolean
}

export function getProviderAccountCapabilities(
  providerId: string,
  definition: ProviderSettingsDefinition
): ProviderAccountCapabilities {
  return {
    managedProfiles: providerId === "codex",
    ping: true,
    reauthenticate: Boolean(
      definition.secretField || definition.guidedCookieLogin || definition.browserCookieImport
    ),
    removeCredential: Boolean(definition.secretField),
  }
}
