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

import { useEffect, useMemo, useState, type KeyboardEvent } from "react"
import { ArrowLeft } from "lucide-react"
import {
  PROVIDER_LIST_NAV_ATTRIBUTE,
  ProviderListRow,
} from "@/components/settings/provider-list-row"
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
// Keyboard navigation
// ---------------------------------------------------------------------------

const LIST_NAV_KEYS = new Set(["ArrowUp", "ArrowDown", "Home", "End"])

/**
 * Every row keeps two Tab stops (open + enable), so both actions stay reachable.
 * Arrow keys add a faster path: ArrowUp/ArrowDown/Home/End move focus to the same
 * control in another row.
 */
export function handleProviderListKeyDown(event: KeyboardEvent<HTMLElement>) {
  if (!LIST_NAV_KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return
  if (!(event.target instanceof HTMLElement)) return
  const column = event.target.getAttribute(PROVIDER_LIST_NAV_ATTRIBUTE)
  if (!column) return

  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      `[${PROVIDER_LIST_NAV_ATTRIBUTE}="${column}"]`
    )
  ).filter(
    (item) => item.getAttribute("aria-disabled") !== "true" && !item.hasAttribute("disabled")
  )
  const index = items.indexOf(event.target)
  if (index === -1) return

  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : Math.min(Math.max(index + (event.key === "ArrowDown" ? 1 : -1), 0), items.length - 1)
  event.preventDefault()
  items[nextIndex]?.focus()
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
    <div className="grid gap-6 py-1 xl:h-full xl:min-h-0 xl:grid-cols-[340px_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)] xl:gap-7">
      {/* ── Left column: provider list ──────────────────────────────── */}
      <section
        className={cn(
          "xl:flex xl:min-h-0 xl:flex-col xl:border-b-0 xl:border-r xl:pb-0 xl:pr-6",
          listHidden ? "hidden xl:flex" : "flex flex-col"
        )}
      >
        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{providers.filter((p) => p.enabled).length} enabled</span>
          <span aria-hidden className="text-border">
            /
          </span>
          <span>{providers.filter((p) => p.supported).length} supported</span>
        </div>

        {/* Keyboard handling is delegated from the focusable controls inside the list. */}
        <ul
          aria-label="Providers"
          className="divide-y divide-border overflow-hidden rounded-lg border border-border xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain"
          onKeyDown={handleProviderListKeyDown}
        >
          {settingsProviders.map((plugin) => (
            <ProviderListRow
              key={plugin.id}
              plugin={plugin}
              selected={plugin.id === selectedProvider?.id}
              isDark={isDark}
              onSelect={() => handleRowSelect(plugin.id)}
              onToggle={onToggle}
              onShow={onShow}
            />
          ))}
        </ul>
      </section>

      {/* ── Right column: provider detail ───────────────────────────── */}
      <div
        className={cn(
          // On xl: always visible
          "xl:block xl:min-h-0 xl:min-w-0 xl:overflow-y-auto xl:overscroll-contain xl:pl-1",
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
