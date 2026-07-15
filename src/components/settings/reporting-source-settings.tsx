import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { ProviderConfig } from "@/lib/provider-settings"

export function ReportingSourceSettings({
  providerId,
  config,
  onConfigChange,
}: {
  providerId: string
  config?: ProviderConfig
  onConfigChange?: (providerId: string, patch: Partial<ProviderConfig>) => Promise<void>
}) {
  const [path, setPath] = useState(config?.historyPath ?? "")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => setPath(config?.historyPath ?? ""), [config?.historyPath, providerId])

  const update = async (patch: Partial<ProviderConfig>, success: string) => {
    if (!onConfigChange) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await onConfigChange(providerId, patch)
      setMessage(success)
    } catch (updateError) {
      console.error("Failed to update reporting source settings:", updateError)
      setError("Reporting settings could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-border/55 py-4">
      <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Local Reporting
      </h4>
      <p className="mt-1 text-sm text-muted-foreground">
        Configure the local ccusage history source and pricing behavior. No transcript content leaves this device.
      </p>
      <label className="mt-3 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Custom data path
      </label>
      <div className="mt-1 flex gap-2">
        <input
          aria-label={`${providerId} custom history path`}
          value={path}
          placeholder={providerId === "claude" ? "%USERPROFILE%\\.claude" : "%USERPROFILE%\\.codex"}
          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onChange={(event) => setPath(event.target.value)}
        />
        <Button
          type="button"
          size="xs"
          disabled={saving}
          onClick={() => void update({ historyPath: path.trim() || undefined }, "History path saved.")}
        >
          Save
        </Button>
      </div>

      <label className="mt-3 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Pricing source
      </label>
      <select
        aria-label={`${providerId} pricing source`}
        value={config?.pricingMode ?? "auto"}
        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        onChange={(event) =>
          void update(
            { pricingMode: event.target.value as ProviderConfig["pricingMode"] },
            "Pricing mode saved."
          )
        }
      >
        <option value="auto">Prefer recorded cost, calculate missing</option>
        <option value="calculate">Recalculate from model pricing</option>
        <option value="display">Recorded cost only</option>
      </select>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <Checkbox
          checked={config?.offlinePricing === "enabled"}
          onCheckedChange={(checked) =>
            void update(
              { offlinePricing: checked === true ? "enabled" : undefined },
              checked === true ? "Offline pricing enabled." : "Online pricing enabled."
            )
          }
        />
        Use bundled offline pricing data
      </label>
      {message ? <p className="mt-2 text-xs text-primary">{message}</p> : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
