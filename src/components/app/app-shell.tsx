import { useShallow } from "zustand/react/shallow"
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react"
import { invoke } from "@tauri-apps/api/core"
import { EyeOff, ListRestart, Power, RefreshCw, Settings as SettingsIcon, SlidersHorizontal } from "lucide-react"
import { AppContent, type AppContentActionProps } from "@/components/app/app-content"
import { PanelFooter } from "@/components/panel-footer"
import { SideNav, type NavPlugin, type PluginContextAction } from "@/components/side-nav"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import { useAppVersion } from "@/hooks/app/use-app-version"
import { panelPreferredMinHeightForView, usePanel } from "@/hooks/app/use-panel"
import { useAppUpdate } from "@/hooks/use-app-update"
import { openSettingsWindow } from "@/lib/settings-window"
import { useAppUiStore } from "@/stores/app-ui-store"
import type { ActiveView } from "@/components/side-nav"

type AppShellProps = {
  onRefreshAll: () => void
  onPanelFocus?: (view?: ActiveView) => void
  navPlugins: NavPlugin[]
  displayPlugins: DisplayPluginState[]
  autoUpdateNextAt: number | null
  selectedPlugin: DisplayPluginState | null
  resolvedSelectedPlugin: DisplayPluginState | null
  hasResolvedViews: boolean
  onPluginContextAction: (pluginId: string, action: PluginContextAction) => void
  isPluginRefreshAvailable: (pluginId: string) => boolean
  onNavReorder: (orderedIds: string[]) => void
  appContentProps: AppContentActionProps
}

const CONTEXT_MENU_WIDTH_PX = 224
const CONTEXT_MENU_HEIGHT_PX = 330
const CONTEXT_MENU_MARGIN_PX = 6

export function AppShell({
  onRefreshAll,
  onPanelFocus,
  navPlugins,
  displayPlugins,
  autoUpdateNextAt,
  selectedPlugin,
  resolvedSelectedPlugin,
  hasResolvedViews,
  onPluginContextAction,
  isPluginRefreshAvailable,
  onNavReorder,
  appContentProps,
}: AppShellProps) {
  const {
    activeView,
    setActiveView,
    showAbout,
    setShowAbout,
  } = useAppUiStore(
    useShallow((state) => ({
      activeView: state.activeView,
      setActiveView: state.setActiveView,
      showAbout: state.showAbout,
      setShowAbout: state.setShowAbout,
    }))
  )

  const {
    containerRef,
    contentColumnRef,
    scrollRef,
    contentMeasureRef,
    footerRef,
    canScrollDown,
    panelHeightPx,
    maxPanelHeightPx,
    isPanelResizing,
  } = usePanel({
    activeView,
    setActiveView,
    showAbout,
    setShowAbout,
    displayPlugins,
    navPluginCount: navPlugins.length,
    onPanelFocus,
  })

  const appVersion = useAppVersion()
  const { updateStatus, triggerInstall, checkForUpdates } = useAppUpdate()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [arrangeMode, setArrangeMode] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    pluginId: string | null
    x: number
    y: number
  } | null>(null)
  const panelStyle =
    panelHeightPx != null
      ? {
          height: `${panelHeightPx}px`,
          maxHeight: `${maxPanelHeightPx ?? panelHeightPx}px`,
        }
      : maxPanelHeightPx != null
        ? { maxHeight: `${maxPanelHeightPx}px` }
        : undefined
  const contentMinHeightPx = panelPreferredMinHeightForView(activeView)
  const activeProviderId = navPlugins.some((plugin) => plugin.id === activeView)
    ? activeView
    : selectedPlugin?.meta.id ?? resolvedSelectedPlugin?.meta.id ?? navPlugins[0]?.id ?? null
  const contextProviderId = contextMenu?.pluginId ?? activeProviderId
  const contextProvider = contextProviderId
    ? navPlugins.find((plugin) => plugin.id === contextProviderId) ?? null
    : null
  const canRefreshContextProvider = contextProvider ? isPluginRefreshAvailable(contextProvider.id) : false

  useEffect(() => {
    if (!contextMenu) return

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      setContextMenu(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null)
    }

    window.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [contextMenu])

  const openContextMenu = useCallback((event: MouseEvent, pluginId?: string) => {
    event.preventDefault()
    const panelBounds = containerRef.current?.getBoundingClientRect()
    const minX = (panelBounds?.left ?? 0) + CONTEXT_MENU_MARGIN_PX
    const minY = (panelBounds?.top ?? 0) + CONTEXT_MENU_MARGIN_PX
    const maxX = (panelBounds?.right ?? window.innerWidth) - CONTEXT_MENU_WIDTH_PX - CONTEXT_MENU_MARGIN_PX
    const maxY = (panelBounds?.bottom ?? window.innerHeight) - CONTEXT_MENU_HEIGHT_PX - CONTEXT_MENU_MARGIN_PX

    setContextMenu({
      pluginId: pluginId ?? null,
      x: Math.max(minX, Math.min(event.clientX, maxX)),
      y: Math.max(minY, Math.min(event.clientY, maxY)),
    })
  }, [containerRef])

  const closePanel = useCallback(() => {
    void invoke("hide_panel").catch((error) => {
      console.error("Failed to hide panel:", error)
    })
  }, [])

  const runContextAction = useCallback((action: PluginContextAction | "refresh-all" | "settings" | "provider-settings" | "close") => {
    const providerId = contextProvider?.id ?? null

    if (action === "arrange") {
      setArrangeMode(true)
      if (providerId) onPluginContextAction(providerId, "arrange")
    } else if (action === "refresh-all") {
      onRefreshAll()
    } else if (action === "settings") {
      void openSettingsWindow({ tab: "general" }).catch(console.error)
    } else if (action === "provider-settings") {
      void openSettingsWindow({ tab: providerId ? "providers" : "general", providerId: providerId ?? undefined }).catch(console.error)
    } else if (action === "close") {
      closePanel()
    } else if (providerId) {
      onPluginContextAction(providerId, action)
    }

    setContextMenu(null)
  }, [closePanel, contextProvider, onPluginContextAction, onRefreshAll])

  return (
    <div ref={containerRef} className="flex flex-col bg-card">
      <div
        className="relative bg-card rounded-xl overflow-hidden select-none w-full border flex flex-col"
        style={panelStyle}
        onContextMenu={openContextMenu}
      >
        <div className="flex flex-1 min-h-0 flex-row">
          <SideNav
            activeView={activeView}
            onViewChange={setActiveView}
            plugins={navPlugins}
            onOpenSettings={() => {
              void openSettingsWindow({ tab: "general" }).catch(console.error)
            }}
            onReorder={onNavReorder}
            arrangeMode={arrangeMode}
            onArrangeModeChange={setArrangeMode}
            onOpenContextMenu={openContextMenu}
          />
          <div ref={contentColumnRef} className="flex-1 flex flex-col px-3 pt-2 pb-1.5 min-w-0 bg-card dark:bg-muted/50">
            <div className="relative flex-1 min-h-0">
              <div ref={scrollRef} className="h-full overflow-y-auto scrollbar-none">
                <div
                  ref={contentMeasureRef}
                  style={{ minHeight: `${contentMinHeightPx}px` }}
                  className={isPanelResizing ? "will-change-[height]" : undefined}
                >
                  <AppContent
                    {...appContentProps}
                    displayPlugins={displayPlugins}
                    selectedPlugin={selectedPlugin}
                    resolvedSelectedPlugin={resolvedSelectedPlugin}
                    hasResolvedViews={hasResolvedViews}
                    isPanelResizing={isPanelResizing}
                    onOpenProviderSettings={(providerId) => {
                      void openSettingsWindow({ tab: "providers", providerId }).catch(console.error)
                    }}
                  />
                </div>
              </div>
              <div
                className={`pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-card dark:from-muted/50 to-transparent transition-opacity duration-200 ${canScrollDown ? "opacity-100" : "opacity-0"}`}
              />
            </div>
            <div ref={footerRef}>
              <PanelFooter
                version={appVersion}
                autoUpdateNextAt={autoUpdateNextAt}
                updateStatus={updateStatus}
                onUpdateInstall={triggerInstall}
                onUpdateCheck={checkForUpdates}
                onRefreshAll={onRefreshAll}
                showAbout={showAbout}
                onShowAbout={() => setShowAbout(true)}
                onCloseAbout={() => setShowAbout(false)}
              />
            </div>
          </div>
        </div>
        {contextMenu ? (
          <div
            ref={menuRef}
            role="menu"
            aria-label="UsageBar Kontextmenü"
            className="fixed z-50 w-56 rounded-md border border-border bg-popover py-1 text-sm text-popover-foreground shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              role="menuitem"
              disabled={!canRefreshContextProvider}
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-45"
              onClick={() => runContextAction("reload")}
            >
              <RefreshCw className="size-4" />
              <span className="flex-1">Provider aktualisieren</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
              onClick={() => runContextAction("refresh-all")}
            >
              <ListRestart className="size-4" />
              <span className="flex-1">Alle Provider aktualisieren</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
              onClick={() => runContextAction("arrange")}
            >
              <SlidersHorizontal className="size-4" />
              <span className="flex-1">Provider anordnen</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
              onClick={() => runContextAction("settings")}
            >
              <SettingsIcon className="size-4" />
              <span className="flex-1">Einstellungen</span>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!contextProvider}
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-45"
              onClick={() => runContextAction("provider-settings")}
            >
              <SettingsIcon className="size-4" />
              <span className="flex-1">Provider-Einstellungen</span>
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              role="menuitem"
              disabled={!contextProvider}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-45"
              onClick={() => runContextAction("remove")}
            >
              <EyeOff className="size-4" />
              <span className="flex-1">Provider ausblenden</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => runContextAction("close")}
            >
              <Power className="size-4" />
              <span className="flex-1">Schließen</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
