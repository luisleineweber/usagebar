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

import { useState, useEffect } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, ChevronRight, GripVertical } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ProviderSettingsDetail } from "@/components/settings/provider-settings-detail";
import type { SettingsPluginState } from "@/hooks/app/use-settings-plugin-list";
import type { ProviderConfig } from "@/lib/provider-settings";
import type { SelectedProviderChangeOptions } from "@/lib/settings-window";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Provider icon mask
// ---------------------------------------------------------------------------

function ProviderIconMask({
  iconUrl,
  brandColor,
}: {
  iconUrl: string;
  brandColor?: string;
}) {
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
  );
}

// ---------------------------------------------------------------------------
// Row subtitle
// ---------------------------------------------------------------------------

function getProviderSubtitle(plugin: SettingsPluginState): string {
  if (plugin.supportState === "comingSoonOnWindows") {
    return plugin.supportMessage ?? "Coming soon on Windows.";
  }
  if (plugin.state.loading) return "Refreshing provider status...";
  if (plugin.state.error) return plugin.state.error;
  if (plugin.state.lastSuccessAt) return "Connected";
  if (plugin.supportMessage) return plugin.supportMessage;
  return plugin.enabled ? "Not connected yet" : "Disabled";
}

// ---------------------------------------------------------------------------
// Sortable provider row
// ---------------------------------------------------------------------------

function SortableProviderRow({
  plugin,
  selected,
  onSelect,
  onToggle,
}: {
  plugin: SettingsPluginState;
  selected: boolean;
  onSelect: () => void;
  onToggle: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plugin.id });
  const isConnected = Boolean(plugin.state.data || plugin.state.lastSuccessAt);

  return (
    /*
     * Why <div role="button"> instead of <button>?
     *
     * @base-ui/react Checkbox.Root renders as a <button> element. Nesting a
     * <button> inside another <button> is invalid HTML — browsers repair the
     * tree by splitting them into siblings, which breaks stopPropagation and
     * causes every checkbox click to also trigger the row's onClick (opening
     * the detail panel). Using a div keeps the HTML valid and stopPropagation
     * on the Checkbox works correctly.
     *
     * Accessibility: role="button" + tabIndex={0} + onKeyDown restore the
     * same keyboard contract as a native button.
     */
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex w-full cursor-pointer flex-wrap items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors sm:flex-nowrap sm:items-center",
        selected
          ? "border-border bg-muted/70 text-foreground shadow-sm"
          : "border-transparent bg-transparent hover:border-border/55 hover:bg-muted/35",
        isDragging && "opacity-50",
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Drag handle */}
      <span
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        onClick={(event) => event.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </span>

      {/* Icon + status dot */}
      <div className="relative">
        <ProviderIconMask
          iconUrl={plugin.iconUrl}
          brandColor={plugin.brandColor}
        />
        <span
          className={cn(
            "absolute -right-1 -top-1 size-2.5 rounded-full border border-card",
            isConnected
              ? "bg-emerald-400"
              : plugin.enabled
                ? "bg-amber-400"
                : "bg-muted",
          )}
        />
      </div>

      {/* Name + subtitle */}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm font-medium",
            !plugin.enabled && "text-muted-foreground",
          )}
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
      <ChevronRight className="size-4 shrink-0 self-center text-muted-foreground/50 xl:hidden" />

      {/* Enable / disable checkbox */}
      <Checkbox
        key={`${plugin.id}-${plugin.enabled}`}
        checked={plugin.enabled}
        disabled={!plugin.supported}
        className={cn(
          "self-start sm:self-auto",
          selected &&
            "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
        )}
        onCheckedChange={(checked) => {
          const nextEnabled = checked === true;
          if (nextEnabled === plugin.enabled) return;
          onToggle(plugin.id);
        }}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProvidersSettingsPane
// ---------------------------------------------------------------------------

type ProvidersSettingsPaneProps = {
  providers: SettingsPluginState[];
  selectedProviderId: string | null;
  onSelectedProviderChange: (
    id: string,
    options?: SelectedProviderChangeOptions,
  ) => void;
  onReorder: (orderedIds: string[]) => void;
  onToggle: (id: string) => void;
  onProviderConfigChange: (
    providerId: string,
    patch: Partial<ProviderConfig>,
  ) => Promise<void>;
  onProviderSecretSave: (
    providerId: string,
    secretKey: string,
    value: string,
  ) => Promise<void>;
  onProviderSecretDelete: (
    providerId: string,
    secretKey: string,
  ) => Promise<void>;
  onRetryProvider: (id: string) => void;
};

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
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  /*
   * Push navigation state for narrow screens.
   *
   * Always starts on "list" — the user explicitly clicks a row to reach the detail.
   * On xl (≥ 1280 px) both panels are always visible via CSS, so this state only
   * controls the narrow-screen experience.
   */
  const [activePanel, setActivePanel] = useState<"list" | "detail">("list");

  // Auto-select the first provider when none is selected (or when the selected one disappears).
  useEffect(() => {
    if (providers.length === 0) return;
    if (
      !selectedProviderId ||
      !providers.some((provider) => provider.id === selectedProviderId)
    ) {
      onSelectedProviderChange(providers[0]!.id);
    }
  }, [onSelectedProviderChange, providers, selectedProviderId]);

  const selectedProvider =
    providers.find((provider) => provider.id === selectedProviderId) ??
    providers[0] ??
    null;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = providers.findIndex((item) => item.id === active.id);
    const newIndex = providers.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(providers, oldIndex, newIndex);
    onReorder(next.map((item) => item.id));
  };

  /** Called when the user explicitly taps / clicks a provider row. */
  const handleRowSelect = (id: string) => {
    onSelectedProviderChange(id, { revealInTray: true });
    setActivePanel("detail");
  };

  if (providers.length === 0) {
    return (
      <div className="border-t border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
        No providers available yet.
      </div>
    );
  }

  const listHidden = activePanel === "detail";
  const detailHidden = activePanel === "list";

  return (
    <div className="grid gap-6 py-1 xl:grid-cols-[340px_minmax(0,1fr)] xl:gap-7">
      {/* ── Left column: provider list ──────────────────────────────── */}
      <section
        className={cn(
          "xl:flex xl:flex-col xl:border-b-0 xl:border-r xl:pb-0 xl:pr-6",
          listHidden
            ? "hidden xl:flex"
            : "flex flex-col",
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={providers.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2.5">
                {providers.map((plugin) => (
                  <SortableProviderRow
                    key={plugin.id}
                    plugin={plugin}
                    selected={plugin.id === selectedProvider?.id}
                    onSelect={() => handleRowSelect(plugin.id)}
                    onToggle={onToggle}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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
            : "block min-w-0",
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
              selectedProvider.supported
                ? () => onRetryProvider(selectedProvider.id)
                : undefined
            }
            onConfigChange={(providerId, patch) =>
              onProviderConfigChange(providerId, patch ?? {})
            }
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
  );
}
