import { ExternalLink } from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { GlobalShortcutSection } from "@/components/global-shortcut-section"
import { PROJECT_ISSUES_URL } from "@/lib/project-metadata"
import {
  AUTO_UPDATE_OPTIONS,
  DISPLAY_MODE_OPTIONS,
  RESET_TIMER_DISPLAY_OPTIONS,
  THEME_OPTIONS,
  type AutoUpdateIntervalMinutes,
  type DisplayMode,
  type GlobalShortcut,
  type ResetTimerDisplayMode,
  type ThemeMode,
} from "@/lib/settings"
import { cn } from "@/lib/utils"

const DENSE_SEGMENTED_GROUP_CLASS = "grid grid-cols-2 gap-2 lg:grid-cols-4"
const TWO_OPTION_GROUP_CLASS = "grid grid-cols-1 gap-2 sm:grid-cols-2"
const THREE_OPTION_GROUP_CLASS = "grid grid-cols-1 gap-2 sm:grid-cols-3"
const SETTINGS_SECTION_CLASS = "border-t border-border/55 pt-4 first:border-t-0 first:pt-0 xl:first:border-t xl:first:pt-4"

type GeneralSettingsPaneProps = {
  autoUpdateInterval: AutoUpdateIntervalMinutes
  onAutoUpdateIntervalChange: (value: AutoUpdateIntervalMinutes) => void
  themeMode: ThemeMode
  onThemeModeChange: (value: ThemeMode) => void
  displayMode: DisplayMode
  onDisplayModeChange: (value: DisplayMode) => void
  resetTimerDisplayMode: ResetTimerDisplayMode
  onResetTimerDisplayModeChange: (value: ResetTimerDisplayMode) => void
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
  displayMode,
  onDisplayModeChange,
  resetTimerDisplayMode,
  onResetTimerDisplayModeChange,
  globalShortcut,
  onGlobalShortcutChange,
  startOnLogin,
  onStartOnLoginChange,
}: GeneralSettingsPaneProps) {
  return (
    <div className="grid gap-x-10 gap-y-6 py-1 xl:grid-cols-2 xl:items-start">
      <section className={SETTINGS_SECTION_CLASS}>
        <h3 className="mb-0 text-base font-semibold">Auto Refresh</h3>
        <p className="mb-3 text-sm text-muted-foreground">Choose how often UsageBar refreshes provider data.</p>
        <div className={DENSE_SEGMENTED_GROUP_CLASS} role="radiogroup" aria-label="Auto-update interval">
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
        <p className="mb-3 text-sm text-muted-foreground">Show quota as remaining usage or consumed usage.</p>
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
        <p className="mb-3 text-sm text-muted-foreground">Choose whether reset times appear as countdowns or clock times.</p>
        <div className={TWO_OPTION_GROUP_CLASS} role="radiogroup" aria-label="Reset timer display mode">
          {RESET_TIMER_DISPLAY_OPTIONS.map((option) => {
            const isActive = option.value === resetTimerDisplayMode
            const absoluteTimeExample = new Intl.DateTimeFormat(undefined, {
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(2026, 1, 2, 11, 4))
            const example = option.value === "relative" ? "5h 12m" : `today at ${absoluteTimeExample}`
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
                <span className={cn("text-xs font-normal", isActive ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {example}
                </span>
              </Button>
            )
          })}
        </div>
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
      </section>

      <GlobalShortcutSection globalShortcut={globalShortcut} onGlobalShortcutChange={onGlobalShortcutChange} />

      <section className={SETTINGS_SECTION_CLASS}>
        <h3 className="mb-0 text-base font-semibold">Start on Login</h3>
        <p className="mb-3 text-sm text-muted-foreground">Open UsageBar automatically after you sign in.</p>
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
        <p className="mb-3 text-sm text-muted-foreground">Open the GitHub issue tracker from settings.</p>
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
