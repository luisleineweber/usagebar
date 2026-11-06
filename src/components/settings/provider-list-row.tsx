import { ChevronRight, Eye, LoaderCircle } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { ProviderIcon } from "@/components/provider-icon"
import type { SettingsPluginState } from "@/hooks/app/use-settings-plugin-list"
import {
  getProviderConnectionState,
  PROVIDER_CONNECTION_STATE_LABELS,
  type ProviderConnectionState,
} from "@/lib/provider-connection-state"
import { cn } from "@/lib/utils"

/** Column marker for arrow-key navigation inside the provider list ("open" or "enable"). */
export const PROVIDER_LIST_NAV_ATTRIBUTE = "data-provider-nav"

const STATE_DOT_CLASS = {
  connected: "bg-emerald-500",
  error: "bg-destructive",
  setupNeeded: "bg-amber-500",
  disabled: "border border-foreground/40 bg-transparent",
  unsupported: "border border-dashed border-foreground/40 bg-transparent",
} satisfies Record<ProviderConnectionState, string>

/**
 * Platform support text from the manifest support state. Experimental rows get a short
 * fixed text: their manifest message also holds setup guidance, which belongs on the detail page.
 */
function getSupportText(plugin: SettingsPluginState): string | null {
  if (plugin.supportState === "comingSoonOnWindows") {
    return plugin.supportMessage ?? "Coming soon on Windows."
  }
  if (plugin.supportState === "experimental") return "Experimental on Windows."
  return null
}

export function ProviderListRow({
  plugin,
  selected,
  isDark,
  onSelect,
  onToggle,
  onShow,
}: {
  plugin: SettingsPluginState
  selected: boolean
  isDark: boolean
  onSelect: () => void
  onToggle: (id: string) => void
  onShow: (id: string) => void
}) {
  const connectionState = getProviderConnectionState(plugin)
  const stateLabel = PROVIDER_CONNECTION_STATE_LABELS[connectionState]
  const supportText = getSupportText(plugin)
  const enableId = `provider-list-${plugin.id}-enabled`
  const supportTextId = `provider-list-${plugin.id}-support`

  return (
    /*
     * The open button stretches over the whole row with an `::after` layer, so a click
     * anywhere on the row opens the detail. The enable control and the show button sit
     * above that layer as separate controls with their own focus and events.
     */
    <li
      className={cn(
        "relative flex items-center gap-3 px-3 py-2.5 transition-colors",
        selected ? "bg-muted/70" : "hover:bg-muted/35"
      )}
    >
      <button
        type="button"
        aria-label={`${plugin.name}, ${stateLabel}`}
        aria-current={selected ? "true" : undefined}
        aria-describedby={supportText ? supportTextId : undefined}
        data-provider-nav="open"
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left outline-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-inset after:ring-ring/50 focus-visible:after:ring-[3px]"
        onClick={onSelect}
      >
        <ProviderIcon
          iconUrl={plugin.iconUrl}
          darkIconUrl={plugin.darkIconUrl}
          iconColorMode={plugin.iconColorMode}
          iconAspectRatio={plugin.iconAspectRatio}
          fit="natural"
          brandColor={plugin.brandColor}
          isDark={isDark}
          className={plugin.iconAspectRatio ? "h-3 w-3" : "size-5"}
          ariaHidden
          testId="provider-icon"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{plugin.name}</span>
          <span
            data-testid="provider-list-state"
            className="flex items-center gap-1.5 text-xs leading-5 text-foreground/70"
          >
            <span
              aria-hidden
              className={cn("size-2 rounded-full", STATE_DOT_CLASS[connectionState])}
            />
            {stateLabel}
            {plugin.state.loading ? (
              <LoaderCircle aria-hidden className="size-3 motion-safe:animate-spin" />
            ) : null}
          </span>
          {supportText ? (
            <span
              id={supportTextId}
              data-testid="provider-list-support"
              className="block text-xs leading-5 text-foreground/70"
            >
              {supportText}
            </span>
          ) : null}
        </span>
      </button>

      <div className="relative z-10 flex items-center gap-2">
        <Checkbox
          id={enableId}
          key={`${plugin.id}-${plugin.enabled}`}
          aria-label={`Enable ${plugin.name}`}
          checked={plugin.enabled}
          disabled={!plugin.supported}
          data-provider-nav="enable"
          className="border-foreground/50"
          onCheckedChange={(checked) => {
            const nextEnabled = checked === true
            if (nextEnabled === plugin.enabled) return
            onToggle(plugin.id)
          }}
        />
        <label htmlFor={enableId} className="cursor-pointer text-xs text-foreground/70">
          Enable
        </label>
      </div>

      {plugin.hidden ? (
        <button
          type="button"
          className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label={`Show ${plugin.name} in sidebar`}
          title="Show in sidebar"
          onClick={() => onShow(plugin.id)}
        >
          <Eye className="size-4" />
        </button>
      ) : null}

      {/* Decorative: clicks here reach the stretched open button below. Hidden at xl, where the detail is always visible. */}
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-foreground/50 xl:hidden" />
    </li>
  )
}
