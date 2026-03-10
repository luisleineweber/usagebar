import { invoke } from "@tauri-apps/api/core"

type SecretCommandArgs = {
  providerId: string
  secretKey: string
}

export async function setProviderSecret(
  providerId: string,
  secretKey: string,
  value: string
): Promise<void> {
  await invoke("set_provider_secret", {
    providerId,
    secretKey,
    value,
  })
}

export async function deleteProviderSecret(
  providerId: string,
  secretKey: string
): Promise<void> {
  await invoke("delete_provider_secret", {
    providerId,
    secretKey,
  } satisfies SecretCommandArgs)
}
