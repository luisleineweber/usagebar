import { invoke } from "@tauri-apps/api/core"

export type ProviderAccountProfile = {
  profileId: string
  label: string
  email?: string
  accountId?: string
  sourceKind: string
  lastImportedAt: number
  lastValidatedAt?: number
  lastError?: string
}

export type ImportedProviderAccountResponse = {
  profile: ProviderAccountProfile
  wasFirstProfile: boolean
}

export async function listProviderAccountProfiles(
  providerId: string
): Promise<ProviderAccountProfile[]> {
  return invoke("list_provider_account_profiles", { providerId })
}

export async function importCurrentProviderAccountProfile(
  providerId: string
): Promise<ImportedProviderAccountResponse> {
  return invoke("import_current_provider_account_profile", { providerId })
}

export async function deleteProviderAccountProfile(
  providerId: string,
  profileId: string
): Promise<ProviderAccountProfile | null> {
  return invoke("delete_provider_account_profile", { providerId, profileId })
}
