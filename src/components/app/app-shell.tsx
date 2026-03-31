import { useShallow } from "zustand/react/shallow"
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

  return (
    <div ref={containerRef} className="flex flex-col bg-card">
      <div
        className="relative bg-card rounded-xl overflow-hidden select-none w-full border flex flex-col"
        style={panelStyle}
      >
        <div className="flex flex-1 min-h-0 flex-row">
          <SideNav
            activeView={activeView}
            onViewChange={setActiveView}
            plugins={navPlugins}
            onOpenSettings={() => {
              void openSettingsWindow({ tab: "general" }).catch(console.error)
            }}
            onPluginContextAction={onPluginContextAction}
            isPluginRefreshAvailable={isPluginRefreshAvailable}
            onReorder={onNavReorder}
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
      </div>
    </div>
  )
}
