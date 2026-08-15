import type { ProviderSettingsDefinition } from "@/lib/provider-settings"

export type ProviderAccountCapabilities = {
  managedProfiles: boolean
  ping: boolean
  reauthenticate: boolean
  removeCredential: boolean
}

export function getProviderAccountCapabilities(
  _providerId: string,
  definition: ProviderSettingsDefinition
): ProviderAccountCapabilities {
  return {
    managedProfiles: definition.managedAccounts === true,
    ping: true,
    reauthenticate: Boolean(
      definition.secretField || definition.guidedCookieLogin || definition.browserCookieImport
    ),
    removeCredential: Boolean(definition.secretField),
  }
}
