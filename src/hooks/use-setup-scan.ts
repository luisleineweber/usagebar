import { useCallback, useRef, useState } from "react"
import type { ProviderInstanceRef, SetupDetection } from "@/lib/plugin-types"
import { scanProviderSetup } from "@/lib/setup-scan"

type ScanResult = { detections: SetupDetection[]; basis: SetupDetection[] | undefined }

/**
 * Local setup scan for one provider. A scan result replaces the probe detections until the
 * next probe delivers newer detections.
 */
export function useSetupScan({
  providerId,
  instanceRef,
  probeDetections,
}: {
  providerId: string
  instanceRef?: ProviderInstanceRef
  probeDetections: SetupDetection[] | undefined
}) {
  const [result, setResult] = useState<ScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  const scan = useCallback(async () => {
    const id = ++requestId.current
    setScanning(true)
    setError(null)
    try {
      const detections = await scanProviderSetup(providerId, instanceRef)
      if (id === requestId.current) setResult({ detections, basis: probeDetections })
    } catch (scanError) {
      console.error("Setup scan failed:", scanError)
      if (id === requestId.current) setError(String(scanError))
    } finally {
      if (id === requestId.current) setScanning(false)
    }
  }, [providerId, instanceRef, probeDetections])

  // A newer probe result supersedes an older scan result.
  const scanIsCurrent = result !== null && result.basis === probeDetections
  return {
    detections: scanIsCurrent ? result.detections : probeDetections,
    scanning,
    error,
    scan,
  }
}
