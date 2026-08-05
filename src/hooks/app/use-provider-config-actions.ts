import { useCallback, useEffect, useRef, useState } from "react"
import {
  clearProviderSecretMetadata,
  loadProviderConfigs,
  saveProviderConfigs,
  setProviderSecretMetadata,
  updateProviderConfig,
  type ProviderConfig,
  type ProviderConfigs,
} from "@/lib/provider-settings"
import { deleteProviderSecret, setProviderSecret } from "@/lib/provider-secrets"
import { getErrorMessage } from "@/lib/error-utils"
import {
  listenProviderConfigsUpdated,
  notifyProviderConfigsUpdated,
} from "@/lib/provider-config-events"

type UseProviderConfigActionsArgs = {
  providerConfigs: ProviderConfigs
  setProviderConfigs: (value: ProviderConfigs) => void
}

export function useProviderConfigActions({
  providerConfigs,
  setProviderConfigs,
}: UseProviderConfigActionsArgs) {
  const providerConfigsRef = useRef(providerConfigs)
  const mountedRef = useRef(true)
  const [providerConfigLoadError, setProviderConfigLoadError] = useState<string | null>(null)

  useEffect(() => {
    providerConfigsRef.current = providerConfigs
  }, [providerConfigs])

  const reloadProviderConfigs = useCallback(async () => {
    try {
      const configs = await loadProviderConfigs()
      if (!mountedRef.current) return
      setProviderConfigs(configs)
      setProviderConfigLoadError(null)
    } catch (error) {
      if (!mountedRef.current) return
      console.error("Failed to load provider configs:", error)
      setProviderConfigLoadError(
        getErrorMessage(error, "Provider settings could not be loaded. Try again.")
      )
    }
  }, [setProviderConfigs])

  useEffect(() => {
    void reloadProviderConfigs()
    let unlisten: (() => void) | undefined
    void listenProviderConfigsUpdated((configs) => {
      providerConfigsRef.current = configs
      setProviderConfigs(configs)
    }).then((dispose) => {
      if (!mountedRef.current) dispose()
      else unlisten = dispose
    })

    return () => {
      mountedRef.current = false
      unlisten?.()
    }
  }, [reloadProviderConfigs, setProviderConfigs])

  const persistProviderConfigs = useCallback(
    async (nextConfigs: ProviderConfigs) => {
      providerConfigsRef.current = nextConfigs
      setProviderConfigs(nextConfigs)
      await saveProviderConfigs(nextConfigs)
      await notifyProviderConfigsUpdated(nextConfigs)
    },
    [setProviderConfigs]
  )

  const handleProviderConfigChange = useCallback(
    async (providerId: string, patch: Partial<ProviderConfig>) => {
      const nextConfigs = updateProviderConfig(providerConfigsRef.current, providerId, patch)
      await persistProviderConfigs(nextConfigs)
    },
    [persistProviderConfigs]
  )

  const handleProviderSecretSave = useCallback(
    async (providerId: string, secretKey: string, value: string) => {
      try {
        await setProviderSecret(providerId, secretKey, value)
        const nextConfigs = setProviderSecretMetadata(
          providerConfigsRef.current,
          providerId,
          secretKey
        )
        await persistProviderConfigs(nextConfigs)
      } catch (error) {
        console.error("Failed to save provider secret:", error)
        throw error
      }
    },
    [persistProviderConfigs]
  )

  const handleProviderSecretDelete = useCallback(
    async (providerId: string, secretKey: string) => {
      try {
        await deleteProviderSecret(providerId, secretKey)
        const nextConfigs = clearProviderSecretMetadata(
          providerConfigsRef.current,
          providerId,
          secretKey
        )
        await persistProviderConfigs(nextConfigs)
      } catch (error) {
        console.error("Failed to delete provider secret:", error)
        throw error
      }
    },
    [persistProviderConfigs]
  )

  return {
    providerConfigLoadError,
    retryProviderConfigs: reloadProviderConfigs,
    handleProviderConfigChange,
    handleProviderSecretSave,
    handleProviderSecretDelete,
  }
}
