import type { ProviderConfig } from "@/lib/provider-settings"
import type { ProviderInstanceRef } from "@/lib/plugin-types"

export function providerInstanceRef(
  providerId: string,
  config?: Pick<ProviderConfig, "selectedAccountProfileId">
): ProviderInstanceRef {
  const instanceId = config?.selectedAccountProfileId?.trim()
  return instanceId ? { providerId, instanceId } : { providerId }
}

export function providerInstanceKey(ref: ProviderInstanceRef): string {
  return ref.instanceId ? `${ref.providerId}\u0000${ref.instanceId}` : ref.providerId
}

export function sameProviderInstance(
  left: ProviderInstanceRef | undefined,
  right: ProviderInstanceRef | undefined
): boolean {
  if (!left || !right) return left === right
  return left.providerId === right.providerId && left.instanceId === right.instanceId
}
