import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ProviderInstanceRef, SetupDetection } from "@/lib/plugin-types"
import { scanProviderSetup } from "@/lib/setup-scan"

type ScanResult = {
  scanKey: string
  detections: SetupDetection[]
  basis: SetupDetection[] | undefined
}
type ScanError = { scanKey: string; message: string }

function getScanKey(providerId: string, accountId: string | undefined): string {
  return JSON.stringify([providerId, accountId ?? null])
}

/**
 * Local setup scan for one provider account. Scan state is bound to the provider and the
 * selected account: a change of either, or an unmount, invalidates a pending scan, and a
 * result or error from another account is never shown. A scan result replaces the probe
 * detections until the next probe delivers newer detections.
 */
export function useSetupScan({
  providerId,
  accountId,
  probeDetections,
}: {
  providerId: string
  /** Selected managed account, or undefined for the default local login. */
  accountId?: string
  probeDetections: SetupDetection[] | undefined
}) {
  const scanKey = getScanKey(providerId, accountId)
  const instanceRef = useMemo<ProviderInstanceRef | undefined>(
    () => (accountId ? { providerId, instanceId: accountId } : undefined),
    [providerId, accountId]
  )
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState<ScanError | null>(null)
  const [pending, setPending] = useState<{ scanKey: string; id: number } | null>(null)
  const requestId = useRef(0)

  // A provider or account change, or an unmount, invalidates the pending scan.
  useEffect(
    () => () => {
      requestId.current += 1
    },
    [scanKey]
  )

  const scan = useCallback(async () => {
    const id = ++requestId.current
    setPending({ scanKey, id })
    setError(null)
    try {
      const detections = await scanProviderSetup(providerId, instanceRef)
      if (id === requestId.current) setResult({ scanKey, detections, basis: probeDetections })
    } catch (scanError) {
      console.error("Setup scan failed:", scanError)
      if (id === requestId.current) setError({ scanKey, message: String(scanError) })
    } finally {
      setPending((current) => (current?.id === id ? null : current))
    }
  }, [scanKey, providerId, instanceRef, probeDetections])

  // A newer probe result supersedes an older scan result.
  const scanIsCurrent =
    result !== null && result.scanKey === scanKey && result.basis === probeDetections
  return {
    detections: scanIsCurrent ? result.detections : probeDetections,
    scanning: pending?.scanKey === scanKey,
    error: error?.scanKey === scanKey ? error.message : null,
    scan,
  }
}
