import { ExternalLink } from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useDarkMode } from "@/hooks/use-dark-mode"
import { GlobalShortcutSection } from "@/components/global-shortcut-section"
import { SurfacePinSettings } from "@/components/settings/surface-pin-settings"
import { NotificationSettingsSection } from "@/components/settings/notification-settings-section"
import type { TraySettingsPreview } from "@/lib/tray-preview"
import { PROJECT_ISSUES_URL } from "@/lib/project-metadata"
import {
  AUTO_UPDATE_OPTIONS,
  ACCENT_COLOR_OPTIONS,
  DISPLAY_MODE_OPTIONS,
  MENUBAR_ICON_STYLE_OPTIONS,
  TRAY_PROVIDER_SELECTION_OPTIONS,
  RESET_TIMER_DISPLAY_OPTIONS,
  THEME_OPTIONS,
  TIME_FORMAT_OPTIONS,
  getDisplayAccentColor,
  type AutoUpdateIntervalMinutes,
  type AccentColor,
  type DisplayMode,
  type GlobalShortcut,
  type MenubarIconStyle,
  type TrayProviderSelection,
  type ResetTimerDisplayMode,
  type ThemeMode,
  type TimeFormatMode,
} from "@/lib/settings"
import { getContrastTextColor } from "@/lib/color"
import { getTimeFormatter } from "@/lib/reset-tooltip"
import { cn } from "@/lib/utils"

const DENSE_SEGMENTED_GROUP_CLASS = "grid grid-cols-2 gap-2 lg:grid-cols-4"
const TWO_OPTION_GROUP_CLASS = "grid grid-cols-1 gap-2 sm:grid-cols-2"
const THREE_OPTION_GROUP_CLASS = "grid grid-cols-1 gap-2 sm:grid-cols-3"
const SETTINGS_SECTION_CLASS =
  "border-t border-border/55 pt-4 first:border-t-0 first:pt-0 xl:first:border-t xl:first:pt-4"

type GeneralSettingsPaneProps = {
  autoUpdateInterval: AutoUpdateIntervalMinutes
  onAutoUpdateIntervalChange: (value: AutoUpdateIntervalMinutes) => void
  themeMode: ThemeMode
  onThemeModeChange: (value: ThemeMode) => void
  accentColor: AccentColor
  onAccentColorChange: (value: AccentColor) => void
  displayMode: DisplayMode
  onDisplayModeChange: (value: DisplayMode) => void
  resetTimerDisplayMode: ResetTimerDisplayMode
  onResetTimerDisplayModeChange: (value: ResetTimerDisplayMode) => void
  timeFormatMode: TimeFormatMode
  onTimeFormatModeChange: (value: TimeFormatMode) => void
  menubarIconStyle: MenubarIconStyle
  onMenubarIconStyleChange: (value: MenubarIconStyle) => void
  trayProviderSelection: TrayProviderSelection
  onTrayProviderSelectionChange: (value: TrayProviderSelection) => void
  showHistoryInBar: boolean
  onShowHistoryInBarChange: (value: boolean) => void
  traySettingsPreview: TraySettingsPreview
  globalShortcut: GlobalShortcut
  onGlobalShortcutChange: (value: GlobalShortcut) => void
  startOnLogin: boolean
  onStartOnLoginChange: (value: boolean) => void
}

export function GeneralSettingsPane({
  autoUpdateInterval,
  onAutoUpdateIntervalChange,
  themeMode,
  onThemeModeChange,
  accentColor,
  onAccentColorChange,
  displayMode,
  onDisplayModeChange,
  resetTimerDisplayMode,
  onResetTimerDisplayModeChange,
  timeFormatMode,
  onTimeFormatModeChange,
  menubarIconStyle,
  onMenubarIconStyleChange,
  trayProviderSelection,
  onTrayProviderSelectionChange,
  showHistoryInBar,
  onShowHistoryInBarChange,
  traySettingsPreview,
  globalShortcut,
  onGlobalShortcutChange,
  startOnLogin,
  onStartOnLoginChange,
}: GeneralSettingsPaneProps) {
  const isDark = useDarkMode()

  return (
    <div className="grid gap-x-10 gap-y-6 py-1 xl:grid-cols-2 xl:items-start">
      <section className={SETTINGS_SECTION_CLASS}>
        <h3 className="mb-0 text-base font-semibold">Auto Refresh</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Choose how often UsageBar refreshes provider data.
        </p>
        <div
          className={DENSE_SEGMENTED_GROUP_CLASS}
          role="radiogroup"
          aria-label="Auto-update interval"
        >
          {AUTO_UPDATE_OPTIONS.map((option) => {
            const isActive = option.value === autoUpdateInterval
            return (
              <Button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="min-h-9 w-full"
                onClick={() => onAutoUpdateIntervalChange(option.value)}
              >
                {option.label}
              </Button>
            )
          })}
        </div>
      </section>

      <section className={SETTINGS_SECTION_CLASS}>
        <h3 className="mb-0 text-base font-semibold">Usage Mode</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Show quota as remaining usage or consumed usage.
        </p>
        <div className={TWO_OPTION_GROUP_CLASS} role="radiogroup" aria-label="Usage display mode">
          {DISPLAY_MODE_OPTIONS.map((option) => {
            const isActive = option.value === displayMode
            return (
              <Button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="min-h-9 w-full"
                onClick={() => onDisplayModeChange(option.value)}
              >
                {option.label}
              </Button>
            )
          })}
        </div>
      </section>

      <section className={SETTINGS_SECTION_CLASS}>
        <h3 className="mb-0 text-base font-semibold">Reset Timers</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Choose whether reset times appear as countdowns or clock times.
        </p>
        <div
          className={TWO_OPTION_GROUP_CLASS}
          role="radiogroup"
          aria-label="Reset timer display mode"
        >
          {RESET_TIMER_DISPLAY_OPTIONS.map((option) => {
            const isActive = option.value === resetTimerDisplayMode
            const absoluteTimeExample = getTimeFormatter(timeFormatMode).format(
              new Date(2026, 1, 2, 11, 4)
            )
            const example =
              option.value === "relative" ? "5h 12m" : `today at ${absoluteTimeExample}`
            return (
              <Button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="flex h-auto min-h-14 w-full flex-col items-center gap-0 py-2"
                onClick={() => onResetTimerDisplayModeChange(option.value)}
              >
                <span>{option.label}</span>
                <span
                  className={cn(
                    "text-xs font-normal",
                    isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                  )}
                >
                  {example}
                </span>
              </Button>
            )
          })}
        </div>
      </section>

      <section className={SETTINGS_SECTION_CLASS}>
        <h3 className="mb-0 text-base font-semibold">Time Format</h3>
        <p className="mb-3 text-sm text-muted-foreground">12-hour or 24-hour clock</p>
        <div className={THREE_OPTION_GROUP_CLASS} role="radiogroup" aria-label="Time format">
          {TIME_FORMAT_OPTIONS.map((option) => {
            const isActive = option.value === timeFormatMode
            const example = getTimeFormatter(option.value).format(new Date(2026, 1, 2, 11, 4))
            return (
              <Button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                aria-label={option.label}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="flex h-auto min-h-14 w-full flex-col items-center gap-0 py-2"
                onClick={() => onTimeFormatModeChange(option.value)}
              >
                <span>{option.label}</span>
                <span
                  className={cn(
                    "text-xs font-normal",
                    isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                  )}
                >
                  {example}
                </span>
              </Button>
            )
          })}
        </div>
      </section>

      <section className={SETTINGS_SECTION_CLASS}>
        <h3 className="mb-0 text-base font-semibold">Tray Icon</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Choose how current provider usage appears in the system tray.
        </p>
        <div className={DENSE_SEGMENTED_GROUP_CLASS} role="radiogroup" aria-label="Tray icon style">
          {MENUBAR_ICON_STYLE_OPTIONS.map((option) => {
            const isActive = option.value === menubarIconStyle
            return (
              <Button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="min-h-9 w-full"
                onClick={() => onMenubarIconStyleChange(option.value)}
              >
                {option.label}
              </Button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Compact shows remaining usage as a number. Stacked bars compare multiple providers, while Donut combines a provider icon with its usage.
        </p>
        <div
          className={
            menubarIconStyle === "bars"
              ? "mt-4 flex justify-end"
              : "mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-start"
          }
        >
          {menubarIconStyle !== "bars" && (
            <div>
              <h4 className="mb-2 text-sm font-medium">Provider selection</h4>
              <div
                className={TWO_OPTION_GROUP_CLASS}
                role="radiogroup"
                aria-label="Tray provider selection"
              >
                {TRAY_PROVIDER_SELECTION_OPTIONS.map((option) => {
                  const isActive = option.value === trayProviderSelection
                  return (
                    <Button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      className="min-h-9 w-full"
                      onClick={() => onTrayProviderSelectionChange(option.value)}
                    >
                      {option.label}
                    </Button>
                  )
                })}
              </div>
            </div>
          )}
          <div className={menubarIconStyle === "bars" ? "w-full sm:w-48" : undefined}>
            <SurfacePinSettings
              menubarIconStyle={menubarIconStyle}
              trayProviderSelection={trayProviderSelection}
              preview={traySettingsPreview}
            />
          </div>
        </div>
      </section>

      <section className={SETTINGS_SECTION_CLASS}>
        <h3 className="mb-0 text-base font-semibold">Navigation</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Choose which pages are available in the tray panel.
        </p>
        <label className="flex select-none items-start gap-2 text-sm text-foreground">
          <Checkbox
            key={`show-history-in-bar-${showHistoryInBar}`}
            aria-label="Show History in bar"
            checked={showHistoryInBar}
            onCheckedChange={(checked) => onShowHistoryInBarChange(checked === true)}
          />
          <span>
            <span className="block">Show History in bar</span>
            <span className="block text-xs text-muted-foreground">
              Add the History page to the tray panel navigation.
            </span>
          </span>
        </label>
      </section>

      <section className={SETTINGS_SECTION_CLASS}>
        <h3 className="mb-0 text-base font-semibold">App Theme</h3>
        <p className="mb-3 text-sm text-muted-foreground">Choose the app appearance.</p>
        <div className={THREE_OPTION_GROUP_CLASS} role="radiogroup" aria-label="Theme mode">
          {THEME_OPTIONS.map((option) => {
            const isActive = option.value === themeMode
            return (
              <Button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="min-h-9 w-full"
                onClick={() => onThemeModeChange(option.value)}
              >
                {option.label}
              </Button>
            )
          })}
        </div>
        <h3 className="mb-0 mt-5 text-base font-semibold">Accent Color</h3>
        <p className="mb-3 text-sm text-muted-foreground">Choose the UsageBar highlight color.</p>
        <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Accent color">
          {ACCENT_COLOR_OPTIONS.map((option) => {
            const isActive = option.value === accentColor
            const displayColor = getDisplayAccentColor(option.value, isDark)
            return (
              <Button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                aria-label={option.label}
                variant="outline"
                size="sm"
                className={cn("min-h-10 w-full px-2", isActive && "ring-2 ring-offset-2")}
                style={{
                  borderColor: displayColor,
                  backgroundColor: isActive ? displayColor : undefined,
                  color: isActive ? getContrastTextColor(displayColor) : displayColor,
                  outlineColor: displayColor,
                }}
                onClick={() => onAccentColorChange(option.value)}
              >
                {option.label}
              </Button>
            )
          })}
        </div>
      </section>

      <GlobalShortcutSection
        globalShortcut={globalShortcut}
        onGlobalShortcutChange={onGlobalShortcutChange}
      />

      <NotificationSettingsSection className={SETTINGS_SECTION_CLASS} />

      <section className={SETTINGS_SECTION_CLASS}>
        <h3 className="mb-0 text-base font-semibold">Start on Login</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Open UsageBar automatically after you sign in.
        </p>
        <label className="flex select-none items-center gap-2 text-sm text-foreground">
          <Checkbox
            key={`start-on-login-${startOnLogin}`}
            checked={startOnLogin}
            onCheckedChange={(checked) => onStartOnLoginChange(checked === true)}
          />
          Start on login
        </label>
      </section>

      <section className={SETTINGS_SECTION_CLASS}>
        <h3 className="mb-0 text-base font-semibold">Support</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Open the GitHub issue tracker from settings.
        </p>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between sm:w-auto"
          onClick={() => {
            openUrl(PROJECT_ISSUES_URL).catch(console.error)
          }}
        >
          Report an issue
          <ExternalLink className="size-4" />
        </Button>
      </section>
    </div>
  )
}
