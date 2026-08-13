/**
 * ProvidersSettingsPane
 *
 * Layout strategy:
 * - xl (≥ 1280 px): two-column — list on the left, detail on the right, always visible.
 * - < xl (typical settings window size ~960 px): single-column push-navigation.
 *   • Default view: provider list.
 *   • After selecting a provider: list slides out, detail fills the width,
 *     with a "← All providers" back button at the top.
 *
 * The panel-switching is driven by React state (`activePanel`), not CSS alone,
 * so Tailwind `xl:` overrides are used only to keep both columns visible on wide screens.
 * JSDOM-based tests never apply CSS, so both panels remain in the DOM; tests pass unchanged.
 */

import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, ChevronRight, Eye } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { ProviderIcon } from "@/components/provider-icon"
import { useDarkMode } from "@/hooks/use-dark-mode"
import { ProviderSettingsDetail } from "@/components/settings/provider-settings-detail"
import type { SettingsPluginState } from "@/hooks/app/use-settings-plugin-list"
import type { ProviderConfig } from "@/lib/provider-settings"
import type { SelectedProviderChangeOptions } from "@/lib/settings-window"
import { cn } from "@/lib/utils"

const SETTINGS_PROVIDER_PRIORITY = ["codex", "claude", "cursor", "opencode-go"] as const

export function orderSettingsProviders<T extends Pick<SettingsPluginState, "id" | "name">>(
  providers: T[]
): T[] {
  const priorityById = new Map<string, number>(
    SETTINGS_PROVIDER_PRIORITY.map((id, index) => [id, index])
  )

  return [...providers].sort((left, right) => {
    const leftPriority = priorityById.get(left.id)
    const rightPriority = priorityById.get(right.id)

    if (leftPriority !== undefined || rightPriority !== undefined) {
      if (leftPriority === undefined) return 1
      if (rightPriority === undefined) return -1
      return leftPriority - rightPriority
    }

    return left.name.localeCompare(right.name)
  })
}

// ---------------------------------------------------------------------------
// Row subtitle
// ---------------------------------------------------------------------------

function getProviderSubtitle(plugin: SettingsPluginState): string {
  if (plugin.supportState === "comingSoonOnWindows") {
    return plugin.supportMessage ?? "Coming soon on Windows."
  }
  if (plugin.state.loading) return "Refreshing provider status..."
  if (plugin.state.error) return plugin.state.error
  if (plugin.state.lastSuccessAt) return "Connected"
  if (plugin.supportMessage) return plugin.supportMessage
  return plugin.enabled ? "Not connected yet" : "Disabled"
}

// ---------------------------------------------------------------------------
// Provider row
// ---------------------------------------------------------------------------

function ProviderRow({
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
  const isConnected = Boolean(plugin.state.data || plugin.state.lastSuccessAt)

  return (
    /*
     * Provider row and enable controls are separate semantic controls.
     * The native controls stay separate, so their events do not overlap.
     *
     * Each control has its own focus and keyboard behavior.
     */
    <div
      className={cn(
        "group flex w-full flex-wrap items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors sm:flex-nowrap sm:items-center",
        selected
          ? "border-border bg-muted/70 text-foreground shadow-sm"
          : "border-transparent bg-transparent hover:border-border/55 hover:bg-muted/35"
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-left outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] sm:items-center"
        onClick={onSelect}
      >
        {/* Icon + status dot */}
        <div className="relative">
          <ProviderIcon
            iconUrl={plugin.iconUrl}
            darkIconUrl={plugin.darkIconUrl}
            iconColorMode={plugin.iconColorMode}
            brandColor={plugin.brandColor}
            isDark={isDark}
            className="size-5"
            ariaHidden
            testId="provider-icon"
          />
          <span
            className={cn(
              "absolute -right-1 -top-1 size-2.5 rounded-full border border-card",
              isConnected ? "bg-emerald-400" : plugin.enabled ? "bg-amber-400" : "bg-muted"
            )}
          />
        </div>

        {/* Name + subtitle */}
        <span className="min-w-0 flex-1">
          <span
            className={cn("block text-sm font-medium", !plugin.enabled && "text-muted-foreground")}
          >
            {plugin.name}
          </span>
          <span className="block break-words text-xs leading-5 text-muted-foreground">
            {getProviderSubtitle(plugin)}
          </span>
        </span>

        {/*
        ChevronRight — only visible on narrow screens to signal "tap to configure".
        Hidden at xl because the two-column layout makes the right panel always visible.
      */}
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 self-center text-muted-foreground/50 xl:hidden"
        />
      </button>

      {/* Enable / disable checkbox */}
      <Checkbox
        key={`${plugin.id}-${plugin.enabled}`}
        aria-label={`Enable ${plugin.name}`}
        checked={plugin.enabled}
        disabled={!plugin.supported}
        className={cn(
          "self-start sm:self-auto",
          selected &&
            "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground"
        )}
        onCheckedChange={(checked) => {
          const nextEnabled = checked === true
          if (nextEnabled === plugin.enabled) return
          onToggle(plugin.id)
        }}
      />
      {plugin.hidden ? (
        <button
          type="button"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`Show ${plugin.name} in sidebar`}
          title="Show in sidebar"
          onClick={() => onShow(plugin.id)}
        >
          <Eye className="size-4" />
        </button>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ProvidersSettingsPane
// ---------------------------------------------------------------------------

type ProvidersSettingsPaneProps = {
  providers: SettingsPluginState[]
  selectedProviderId: string | null
  onSelectedProviderChange: (id: string, options?: SelectedProviderChangeOptions) => void
  onToggle: (id: string) => void
  onShow: (id: string) => void
  onProviderConfigChange: (providerId: string, patch: Partial<ProviderConfig>) => Promise<void>
  onProviderSecretSave: (providerId: string, secretKey: string, value: string) => Promise<void>
  onProviderSecretDelete: (providerId: string, secretKey: string) => Promise<void>
  onRetryProvider: (id: string) => void
}

export function ProvidersSettingsPane({
  providers,
  selectedProviderId,
  onSelectedProviderChange,
  onToggle,
  onShow,
  onProviderConfigChange,
  onProviderSecretSave,
  onProviderSecretDelete,
  onRetryProvider,
}: ProvidersSettingsPaneProps) {
  const isDark = useDarkMode()
  const settingsProviders = useMemo(() => orderSettingsProviders(providers), [providers])

  /*
   * Push navigation state for narrow screens.
   *
   * Always starts on "list" — the user explicitly clicks a row to reach the detail.
   * On xl (≥ 1280 px) both panels are always visible via CSS, so this state only
   * controls the narrow-screen experience.
   */
  const [activePanel, setActivePanel] = useState<"list" | "detail">(
    selectedProviderId ? "detail" : "list"
  )

  useEffect(() => {
    setActivePanel(selectedProviderId ? "detail" : "list")
  }, [selectedProviderId])

  const selectedProvider =
    settingsProviders.find((provider) => provider.id === selectedProviderId) ?? null

  /** Called when the user explicitly taps / clicks a provider row. */
  const handleRowSelect = (id: string) => {
    onSelectedProviderChange(id)
    setActivePanel("detail")
  }

  if (providers.length === 0) {
    return (
      <div className="border-t border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
        No providers available yet.
      </div>
    )
  }

  const listHidden = activePanel === "detail"
  const detailHidden = activePanel === "list"

  return (
    <div className="grid gap-6 py-1 xl:grid-cols-[340px_minmax(0,1fr)] xl:gap-7">
      {/* ── Left column: provider list ──────────────────────────────── */}
      <section
        className={cn(
          "xl:flex xl:flex-col xl:border-b-0 xl:border-r xl:pb-0 xl:pr-6",
          listHidden ? "hidden xl:flex" : "flex flex-col"
        )}
      >
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{providers.filter((p) => p.enabled).length} enabled</span>
          <span aria-hidden className="text-border">
            /
          </span>
          <span>{providers.filter((p) => p.supported).length} supported</span>
        </div>

        <div className="pr-1">
          <div className="space-y-2.5">
            {settingsProviders.map((plugin) => (
              <ProviderRow
                key={plugin.id}
                plugin={plugin}
                selected={plugin.id === selectedProvider?.id}
                isDark={isDark}
                onSelect={() => handleRowSelect(plugin.id)}
                onToggle={onToggle}
                onShow={onShow}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Right column: provider detail ───────────────────────────── */}
      <div
        className={cn(
          // On xl: always visible
          "xl:block xl:min-w-0 xl:pl-1",
          // On narrow: toggle visibility
          detailHidden
            ? "hidden xl:block" // hidden on narrow, always shown on xl
            : "block min-w-0"
        )}
      >
        {/*
          Back button — only rendered on narrow screens (xl:hidden).
          Takes the user back to the provider list.
        */}
        <button
          type="button"
          className="mb-5 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground xl:hidden"
          onClick={() => setActivePanel("list")}
          aria-label="Back to providers list"
        >
          <ArrowLeft className="size-4" />
          All providers
        </button>

        {selectedProvider ? (
          <ProviderSettingsDetail
            plugin={selectedProvider.meta}
            enabled={selectedProvider.enabled}
            config={selectedProvider.config}
            state={selectedProvider.state}
            onEnabledChange={() => onToggle(selectedProvider.id)}
            onRetry={
              selectedProvider.supported ? () => onRetryProvider(selectedProvider.id) : undefined
            }
            onConfigChange={(providerId, patch) => onProviderConfigChange(providerId, patch ?? {})}
            onSecretSave={onProviderSecretSave}
            onSecretDelete={onProviderSecretDelete}
            onOpenInTray={
              selectedProvider
                ? () =>
                    onSelectedProviderChange(selectedProvider.id, {
                      revealInTray: true,
                    })
                : undefined
            }
          />
        ) : (
          <div className="flex h-full items-center justify-center border-t border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
            Select a provider to edit its settings.
          </div>
        )}
      </div>
    </div>
  )
}
