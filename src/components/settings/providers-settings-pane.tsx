import { useEffect } from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { ProviderSettingsDetail } from "@/components/settings/provider-settings-detail"
import type { SettingsPluginState } from "@/hooks/app/use-settings-plugin-list"
import type { ProviderConfig } from "@/lib/provider-settings"
import { cn } from "@/lib/utils"

function ProviderIconMask({ iconUrl, brandColor }: { iconUrl: string; brandColor?: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-5 shrink-0 rounded-md bg-foreground/85"
      style={{
        backgroundColor: brandColor ?? "currentColor",
        WebkitMaskImage: `url(${iconUrl})`,
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskImage: `url(${iconUrl})`,
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
      }}
    />
  )
}

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

function SortableProviderRow({
  plugin,
  selected,
  onSelect,
  onToggle,
}: {
  plugin: SettingsPluginState
  selected: boolean
  onSelect: () => void
  onToggle: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: plugin.id })
  const isConnected = Boolean(plugin.state.data || plugin.state.lastSuccessAt)

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors",
        selected
          ? "border-primary/35 bg-primary text-primary-foreground shadow-[0_14px_35px_rgba(37,99,235,0.26)]"
          : "border-transparent bg-card/70 hover:border-border/60 hover:bg-background/85",
        isDragging && "opacity-50"
      )}
      onClick={onSelect}
    >
      <span
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        onClick={(event) => event.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </span>

      <div className="relative">
        <ProviderIconMask iconUrl={plugin.iconUrl} brandColor={plugin.brandColor} />
        <span
          className={cn(
            "absolute -right-1 -top-1 size-2.5 rounded-full border border-card",
            isConnected ? "bg-emerald-400" : plugin.enabled ? "bg-amber-400" : "bg-muted"
          )}
        />
      </div>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm font-medium",
            selected ? "text-primary-foreground" : !plugin.enabled && "text-muted-foreground"
          )}
        >
          {plugin.name}
        </span>
        <span
          className={cn(
            "block truncate text-xs",
            selected ? "text-primary-foreground/75" : "text-muted-foreground"
          )}
        >
          {getProviderSubtitle(plugin)}
        </span>
      </span>

      <Checkbox
        key={`${plugin.id}-${plugin.enabled}`}
        checked={plugin.enabled}
        disabled={!plugin.supported}
        className={cn(
          selected
            && "border-foreground/18 bg-foreground/6 data-checked:border-foreground data-checked:bg-foreground data-checked:text-background"
        )}
        onCheckedChange={(checked) => {
          const nextEnabled = checked === true
          if (nextEnabled === plugin.enabled) return
          onToggle(plugin.id)
        }}
        onClick={(event) => event.stopPropagation()}
      />
    </button>
  )
}

type ProvidersSettingsPaneProps = {
  providers: SettingsPluginState[]
  selectedProviderId: string | null
  onSelectedProviderChange: (id: string, options?: { revealInTray?: boolean }) => void
  onReorder: (orderedIds: string[]) => void
  onToggle: (id: string) => void
  onProviderConfigChange: (providerId: string, patch: Partial<ProviderConfig>) => Promise<void>
  onProviderSecretSave: (providerId: string, secretKey: string, value: string) => Promise<void>
  onProviderSecretDelete: (providerId: string, secretKey: string) => Promise<void>
  onRetryProvider: (id: string) => void
}

export function ProvidersSettingsPane({
  providers,
  selectedProviderId,
  onSelectedProviderChange,
  onReorder,
  onToggle,
  onProviderConfigChange,
  onProviderSecretSave,
  onProviderSecretDelete,
  onRetryProvider,
}: ProvidersSettingsPaneProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    if (providers.length === 0) return
    if (!selectedProviderId || !providers.some((provider) => provider.id === selectedProviderId)) {
      onSelectedProviderChange(providers[0]!.id)
    }
  }, [onSelectedProviderChange, providers, selectedProviderId])

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? providers[0] ?? null

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = providers.findIndex((item) => item.id === active.id)
    const newIndex = providers.findIndex((item) => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const next = arrayMove(providers, oldIndex, newIndex)
    onReorder(next.map((item) => item.id))
  }

  if (providers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        No providers available yet.
      </div>
    )
  }

  return (
    <div className="grid gap-5 py-1 xl:grid-cols-[320px_minmax(0,1fr)]">
      <section className="flex flex-col rounded-[26px] border border-border/70 bg-[linear-gradient(180deg,_hsl(var(--muted))/0.62,_hsl(var(--card))/0.92)] p-4 shadow-[0_10px_35px_rgba(0,0,0,0.12)]">
        <div className="mb-4 border-b border-border/60 pb-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Providers</h3>
          <p className="mt-1 text-sm text-muted-foreground">Reorder your lineup and select a provider to manage.</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border/70 bg-background/70 px-2 py-1">
              {providers.filter((provider) => provider.enabled).length} enabled
            </span>
            <span className="rounded-full border border-border/70 bg-background/70 px-2 py-1">
              {providers.filter((provider) => provider.supported).length} supported
            </span>
          </div>
        </div>

        <div className="pr-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={providers.map((provider) => provider.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2.5">
                {providers.map((plugin) => (
                  <SortableProviderRow
                    key={plugin.id}
                    plugin={plugin}
                    selected={plugin.id === selectedProvider?.id}
                    onSelect={() => onSelectedProviderChange(plugin.id, { revealInTray: true })}
                    onToggle={onToggle}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </section>

      <div className="min-w-0">
        {selectedProvider ? (
          <ProviderSettingsDetail
            plugin={selectedProvider.meta}
            enabled={selectedProvider.enabled}
            config={selectedProvider.config}
            state={selectedProvider.state}
            onEnabledChange={() => onToggle(selectedProvider.id)}
            onRetry={selectedProvider.supported ? () => onRetryProvider(selectedProvider.id) : undefined}
            onConfigChange={(providerId, patch) => onProviderConfigChange(providerId, patch ?? {})}
            onSecretSave={onProviderSecretSave}
            onSecretDelete={onProviderSecretDelete}
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-[26px] border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            Select a provider to edit its settings.
          </div>
        )}
      </div>
    </div>
  )
}
