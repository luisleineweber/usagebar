import { invoke } from "@tauri-apps/api/core"

export type CodexAccountProfile = {
  profileId: string
  label: string
  email?: string
  accountId?: string
  sourceKind: string
  lastImportedAt: number
  lastValidatedAt?: number
  lastError?: string
}

export type ImportedCodexAccountResponse = {
  profile: CodexAccountProfile
  wasFirstProfile: boolean
}

export async function listCodexAccountProfiles(): Promise<CodexAccountProfile[]> {
  return invoke("list_codex_account_profiles")
}

export async function importCurrentCodexAccountProfile(): Promise<ImportedCodexAccountResponse> {
  return invoke("import_current_codex_account_profile")
}

export async function deleteCodexAccountProfile(profileId: string): Promise<CodexAccountProfile | null> {
  return invoke("delete_codex_account_profile", { profileId })
}
