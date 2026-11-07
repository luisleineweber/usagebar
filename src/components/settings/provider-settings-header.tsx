import { RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ProviderIcon } from "@/components/provider-icon"
import { ProviderConnectionBadge } from "@/components/settings/provider-connection-badge"
import { useDarkMode } from "@/hooks/use-dark-mode"
import type { ProviderConnectionState } from "@/lib/provider-connection-state"
import type { PluginMeta } from "@/lib/plugin-types"
import { cn } from "@/lib/utils"

export function ProviderSettingsHeader({
  plugin,
  summary,
  enabled,
  connectionState,
  loading,
  onEnabledChange,
  onCheck,
  onOpenInTray,
}: {
  plugin: PluginMeta
  summary: string
  enabled: boolean
  connectionState: ProviderConnectionState
  loading: boolean
  onEnabledChange: (enabled: boolean) => void
  onCheck?: () => void
  onOpenInTray?: () => void
}) {
  const isDark = useDarkMode()
  const supported = plugin.supportState !== "comingSoonOnWindows"
  // The tray lists enabled providers only, and probes for a disabled provider
  // do not match its Settings state. Keep both actions tied to the toggle.
  const actionsAvailable = enabled && supported

  return (
    <div className="border-b border-border/60 pb-5">
      <div className="flex min-w-0 items-start gap-3">
        <ProviderIcon
          iconUrl={plugin.iconUrl}
          darkIconUrl={plugin.darkIconUrl}
          iconColorMode={plugin.iconColorMode}
          iconAspectRatio={plugin.iconAspectRatio}
          fit="natural"
          brandColor={plugin.brandColor}
          isDark={isDark}
          className={plugin.iconAspectRatio ? "h-4 w-4" : "size-8"}
          ariaHidden
          testId="provider-icon"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Provider configuration
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold tracking-[0.01em] text-foreground">
              {plugin.name}
            </h3>
            <ProviderConnectionBadge state={connectionState} />
            {plugin.supportState === "experimental" && (
              <Badge variant="outline">Experimental</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {onOpenInTray && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenInTray}
            disabled={!actionsAvailable}
          >
            Open in tray
          </Button>
        )}
        {onCheck && supported && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCheck}
            disabled={!actionsAvailable || loading}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden="true" />
            {loading ? "Checking…" : "Check again"}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <label htmlFor={`${plugin.id}-enabled`} className="cursor-pointer text-muted-foreground">
            Enabled
          </label>
          <Checkbox
            id={`${plugin.id}-enabled`}
            aria-label={`Enable ${plugin.name}`}
            checked={enabled}
            disabled={!supported}
            onCheckedChange={(checked) => onEnabledChange(checked === true)}
          />
        </div>
      </div>
    </div>
  )
}
