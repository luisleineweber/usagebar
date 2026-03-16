import { useShallow } from "zustand/react/shallow"
import { AppContent, type AppContentActionProps } from "@/components/app/app-content"
import { PanelFooter } from "@/components/panel-footer"
import { SideNav, type NavPlugin, type PluginContextAction } from "@/components/side-nav"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import { useAppVersion } from "@/hooks/app/use-app-version"
import { usePanel } from "@/hooks/app/use-panel"
import { useAppUpdate } from "@/hooks/use-app-update"
import { openSettingsWindow } from "@/lib/settings-window"
import { useAppUiStore } from "@/stores/app-ui-store"

type AppShellProps = {
  onRefreshAll: () => void
  onPanelFocus?: () => void
  navPlugins: NavPlugin[]
  displayPlugins: DisplayPluginState[]
  autoUpdateNextAt: number | null
  selectedPlugin: DisplayPluginState | null
  onPluginContextAction: (pluginId: string, action: PluginContextAction) => void
  isPluginRefreshAvailable: (pluginId: string) => boolean
  appContentProps: AppContentActionProps
}

export function AppShell({
  onRefreshAll,
  onPanelFocus,
  navPlugins,
  displayPlugins,
  autoUpdateNextAt,
  selectedPlugin,
  onPluginContextAction,
  isPluginRefreshAvailable,
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
          />
          <div ref={contentColumnRef} className="flex-1 flex flex-col px-3 pt-2 pb-1.5 min-w-0 bg-card dark:bg-muted/50">
            <div className="relative flex-1 min-h-0">
              <div ref={scrollRef} className="h-full overflow-y-auto scrollbar-none">
                <div ref={contentMeasureRef}>
                  <AppContent
                    {...appContentProps}
                    displayPlugins={displayPlugins}
                    selectedPlugin={selectedPlugin}
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
