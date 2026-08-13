import { ExternalLink } from "lucide-react"
import type { ReactNode } from "react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
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

type SettingsRadioGroupProps<T extends string | number> = {
  options: readonly { value: T; label: string }[]
  value: T
  onValueChange: (value: T) => void
  className: string
  ariaLabel: string
  renderLabel?: (option: { value: T; label: string }, isActive: boolean) => ReactNode
}

function SettingsRadioGroup<T extends string | number>({
  options,
  value,
  onValueChange,
  className,
  ariaLabel,
  renderLabel,
}: SettingsRadioGroupProps<T>) {
  return (
    <RadioGroup
      value={value}
      aria-label={ariaLabel}
      className={className}
      onValueChange={(nextValue) => onValueChange(nextValue as T)}
    >
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <RadioGroupItem
            key={option.value}
            value={option.value}
            className={cn(
              "min-h-9 w-full cursor-pointer rounded-md border bg-clip-padding px-2.5 text-sm font-medium transition-all",
              "inline-flex items-center justify-center whitespace-nowrap",
              isActive
                ? "border-transparent bg-primary text-primary-foreground hover:bg-primary/80"
                : "border-border bg-background hover:bg-muted hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
              renderLabel && "h-auto flex-col gap-0 py-2"
            )}
          >
            {renderLabel ? renderLabel(option, isActive) : option.label}
          </RadioGroupItem>
        )
      })}
    </RadioGroup>
  )
}

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
        <SettingsRadioGroup
          options={AUTO_UPDATE_OPTIONS}
          value={autoUpdateInterval}
          onValueChange={onAutoUpdateIntervalChange}
          className={DENSE_SEGMENTED_GROUP_CLASS}
          ariaLabel="Auto-update interval"
        />
      </section>

      <section className={SETTINGS_SECTION_CLASS}>
        <h3 className="mb-0 text-base font-semibold">Usage Mode</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Show quota as remaining usage or consumed usage.
        </p>
        <SettingsRadioGroup
          options={DISPLAY_MODE_OPTIONS}
          value={displayMode}
          onValueChange={onDisplayModeChange}
          className={TWO_OPTION_GROUP_CLASS}
          ariaLabel="Usage display mode"
        />
      </section>

      <section className={SETTINGS_SECTION_CLASS}>
        <h3 className="mb-0 text-base font-semibold">Reset Timers</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Choose whether reset times appear as countdowns or clock times.
        </p>
        <SettingsRadioGroup
          options={RESET_TIMER_DISPLAY_OPTIONS}
          value={resetTimerDisplayMode}
          onValueChange={onResetTimerDisplayModeChange}
          className={TWO_OPTION_GROUP_CLASS}
          ariaLabel="Reset timer display mode"
          renderLabel={(option, isActive) => {
            const absoluteTimeExample = getTimeFormatter(timeFormatMode).format(
              new Date(2026, 1, 2, 11, 4)
            )
            const example =
              option.value === "relative" ? "5h 12m" : `today at ${absoluteTimeExample}`
            return (
              <>
                <span>{option.label}</span>
                <span
                  className={cn(
                    "text-xs font-normal",
                    isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                  )}
                >
                  {example}
                </span>
              </>
            )
          }}
        />
      </section>

      <section className={SETTINGS_SECTION_CLASS}>
        <h3 className="mb-0 text-base font-semibold">Time Format</h3>
        <p className="mb-3 text-sm text-muted-foreground">12-hour or 24-hour clock</p>
        <SettingsRadioGroup
          options={TIME_FORMAT_OPTIONS}
          value={timeFormatMode}
          onValueChange={onTimeFormatModeChange}
          className={THREE_OPTION_GROUP_CLASS}
          ariaLabel="Time format"
          renderLabel={(option, isActive) => {
            const example = getTimeFormatter(option.value).format(new Date(2026, 1, 2, 11, 4))
            return (
              <>
                <span>{option.label}</span>
                <span
                  className={cn(
                    "text-xs font-normal",
                    isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                  )}
                >
                  {example}
                </span>
              </>
            )
          }}
        />
      </section>

      <section className={SETTINGS_SECTION_CLASS}>
        <h3 className="mb-0 text-base font-semibold">Tray Icon</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Choose how current provider usage appears in the system tray.
        </p>
        <SettingsRadioGroup
          options={MENUBAR_ICON_STYLE_OPTIONS}
          value={menubarIconStyle}
          onValueChange={onMenubarIconStyleChange}
          className={DENSE_SEGMENTED_GROUP_CLASS}
          ariaLabel="Tray icon style"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Compact shows remaining usage as a number. Stacked bars compare multiple providers, while
          Donut combines a provider icon with its usage.
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
              <SettingsRadioGroup
                options={TRAY_PROVIDER_SELECTION_OPTIONS}
                value={trayProviderSelection}
                onValueChange={onTrayProviderSelectionChange}
                className={TWO_OPTION_GROUP_CLASS}
                ariaLabel="Tray provider selection"
              />
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
        <SettingsRadioGroup
          options={THEME_OPTIONS}
          value={themeMode}
          onValueChange={onThemeModeChange}
          className={THREE_OPTION_GROUP_CLASS}
          ariaLabel="Theme mode"
        />
        <h3 className="mb-0 mt-5 text-base font-semibold">Accent Color</h3>
        <p className="mb-3 text-sm text-muted-foreground">Choose the UsageBar highlight color.</p>
        <RadioGroup
          value={accentColor}
          aria-label="Accent color"
          className="grid grid-cols-5 gap-2"
          onValueChange={(nextValue) => onAccentColorChange(nextValue as AccentColor)}
        >
          {ACCENT_COLOR_OPTIONS.map((option) => {
            const isActive = option.value === accentColor
            const displayColor = getDisplayAccentColor(option.value, isDark)
            return (
              <RadioGroupItem
                key={option.value}
                value={option.value}
                aria-label={option.label}
                className={cn(
                  "min-h-10 w-full cursor-pointer rounded-md border bg-background px-2 text-sm font-medium outline-none transition-all",
                  "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                  isActive && "ring-2 ring-offset-2"
                )}
                style={{
                  borderColor: displayColor,
                  backgroundColor: isActive ? displayColor : undefined,
                  color: isActive ? getContrastTextColor(displayColor) : displayColor,
                  outlineColor: displayColor,
                }}
              >
                {option.label}
              </RadioGroupItem>
            )
          })}
        </RadioGroup>
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
