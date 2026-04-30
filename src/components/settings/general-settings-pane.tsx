import { ExternalLink } from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { GlobalShortcutSection } from "@/components/global-shortcut-section"
import { PROJECT_ISSUES_URL } from "@/lib/project-metadata"
import { getBarFillLayout, getTrayIconSizePx } from "@/lib/tray-bars-icon"
import {
  AUTO_UPDATE_OPTIONS,
  DISPLAY_MODE_OPTIONS,
  MENUBAR_ICON_STYLE_OPTIONS,
  RESET_TIMER_DISPLAY_OPTIONS,
  THEME_OPTIONS,
  type AutoUpdateIntervalMinutes,
  type DisplayMode,
  type GlobalShortcut,
  type MenubarIconStyle,
  type ResetTimerDisplayMode,
  type ThemeMode,
} from "@/lib/settings"
import type { TraySettingsPreview } from "@/hooks/app/use-tray-icon"
import { cn } from "@/lib/utils"

const TRAY_PREVIEW_SIZE_PX = getTrayIconSizePx(1)
const PREVIEW_BAR_TRACK_PX = 20
const DENSE_SEGMENTED_GROUP_CLASS = "grid grid-cols-2 gap-2 lg:grid-cols-4"
const TWO_OPTION_GROUP_CLASS = "grid grid-cols-1 gap-2 sm:grid-cols-2"
const THREE_OPTION_GROUP_CLASS = "grid grid-cols-1 gap-2 sm:grid-cols-3"
const FOUR_OPTION_GROUP_CLASS = "grid grid-cols-2 gap-2 sm:grid-cols-4"
const SETTINGS_SECTION_CLASS = "border-t border-border/55 pt-4 first:border-t-0 first:pt-0 xl:first:border-t xl:first:pt-4"

function getPreviewBarLayout(fraction: number): { fillPercent: number; remainderPercent: number } {
  const { fillW, remainderDrawW } = getBarFillLayout(PREVIEW_BAR_TRACK_PX, fraction)
  return {
    fillPercent: (fillW / PREVIEW_BAR_TRACK_PX) * 100,
    remainderPercent: (remainderDrawW / PREVIEW_BAR_TRACK_PX) * 100,
  }
}

function ProviderIconMask({
  iconUrl,
  isActive,
  sizePx,
}: {
  iconUrl?: string
  isActive: boolean
  sizePx: number
}) {
  const colorClass = isActive ? "bg-primary-foreground" : "bg-foreground"
  if (iconUrl) {
    return (
      <div
        aria-hidden
        className={cn("shrink-0", colorClass)}
        style={{
          width: `${sizePx}px`,
          height: `${sizePx}px`,
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
  const textClass = isActive ? "text-primary-foreground" : "text-foreground"
  return (
    <svg aria-hidden viewBox="0 0 26 26" className={cn("shrink-0", textClass)} style={{ width: `${sizePx}px`, height: `${sizePx}px` }}>
      <circle cx="13" cy="13" r="9" fill="none" stroke="currentColor" strokeWidth="3.5" opacity={0.3} />
    </svg>
  )
}

function MenubarIconStylePreview({
  style,
  isActive,
  traySettingsPreview,
}: {
  style: MenubarIconStyle
  isActive: boolean
  traySettingsPreview: TraySettingsPreview
}) {
  const textClass = isActive ? "text-primary-foreground" : "text-foreground"

  if (style === "provider") {
    return (
      <div className="inline-flex items-center gap-0.5">
        <ProviderIconMask iconUrl={traySettingsPreview.providerIconUrl} isActive={isActive} sizePx={TRAY_PREVIEW_SIZE_PX} />
        <span className={cn("text-[12px] font-semibold tabular-nums leading-none", textClass)}>
          {traySettingsPreview.providerPercentText}
        </span>
      </div>
    )
  }

  if (style === "bars" || style === "merged") {
    const trackClass = isActive ? "bg-primary-foreground/15" : "bg-foreground/15"
    const remainderClass = isActive ? "bg-primary-foreground/20" : "bg-foreground/15"
    const fillClass = isActive ? "bg-primary-foreground" : "bg-foreground"
    const sourceFractions = style === "merged"
      ? traySettingsPreview.providerBars
      : traySettingsPreview.bars
    const fractions = sourceFractions.length > 0
      ? sourceFractions.map((b) => b.fraction ?? 0)
      : [0.83, 0.7, 0.56]

    return (
      <div className="flex items-center gap-1.5">
        {style === "merged" ? (
          <ProviderIconMask iconUrl={traySettingsPreview.providerIconUrl} isActive={isActive} sizePx={13} />
        ) : null}
        <div className={cn("flex flex-col gap-0.5", style === "merged" ? "w-4" : "w-5")}>
          {fractions.map((fraction, i) => {
            const { fillPercent, remainderPercent } = getPreviewBarLayout(fraction)
            return (
              <div key={i} className={cn("relative h-1 rounded-sm", trackClass)}>
                {remainderPercent > 0 && (
                  <span
                    aria-hidden
                    className={remainderClass}
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: `${remainderPercent}%`,
                      borderRadius: "1px 2px 2px 1px",
                    }}
                  />
                )}
                <div
                  className={cn("h-1", fillClass)}
                  style={{ width: `${fillPercent}%`, borderRadius: "2px 1px 1px 2px" }}
                />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const fraction = traySettingsPreview.providerBars[0]?.fraction ?? 0
  const clamped = Math.max(0, Math.min(1, fraction))
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: `${TRAY_PREVIEW_SIZE_PX}px`, height: `${TRAY_PREVIEW_SIZE_PX}px` }}>
      <svg aria-hidden viewBox="0 0 26 26" className={cn("absolute inset-0", textClass)}>
        <circle cx="13" cy="13" r="9" fill="none" stroke="currentColor" strokeWidth="4" opacity={isActive ? 0.2 : 0.15} />
        {clamped > 0 && (
          <circle
            cx="13"
            cy="13"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="butt"
            pathLength="100"
            strokeDasharray={`${Math.round(clamped * 100)} 100`}
            transform="rotate(-90 13 13)"
          />
        )}
      </svg>
      <ProviderIconMask iconUrl={traySettingsPreview.providerIconUrl} isActive={isActive} sizePx={12} />
    </div>
  )
}

type GeneralSettingsPaneProps = {
  autoUpdateInterval: AutoUpdateIntervalMinutes
  onAutoUpdateIntervalChange: (value: AutoUpdateIntervalMinutes) => void
  themeMode: ThemeMode
  onThemeModeChange: (value: ThemeMode) => void
  displayMode: DisplayMode
  onDisplayModeChange: (value: DisplayMode) => void
  resetTimerDisplayMode: ResetTimerDisplayMode
  onResetTimerDisplayModeChange: (value: ResetTimerDisplayMode) => void
  menubarIconStyle: MenubarIconStyle
  onMenubarIconStyleChange: (value: MenubarIconStyle) => void
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
  displayMode,
  onDisplayModeChange,
  resetTimerDisplayMode,
  onResetTimerDisplayModeChange,
  menubarIconStyle,
  onMenubarIconStyleChange,
  traySettingsPreview,
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
        <h3 className="mb-0 text-base font-semibold">Menubar Icon</h3>
        <p className="mb-3 text-sm text-muted-foreground">Choose what UsageBar shows in the menu bar.</p>
        <div className={FOUR_OPTION_GROUP_CLASS} role="radiogroup" aria-label="Menubar icon style">
          {MENUBAR_ICON_STYLE_OPTIONS.map((option) => {
            const isActive = option.value === menubarIconStyle
            return (
              <Button
                key={option.value}
                type="button"
                role="radio"
                aria-label={option.label}
                aria-checked={isActive}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="flex h-12 w-full flex-col items-center justify-center gap-1"
                onClick={() => onMenubarIconStyleChange(option.value)}
              >
                <MenubarIconStylePreview style={option.value} isActive={isActive} traySettingsPreview={traySettingsPreview} />
                <span className="text-[10px] font-medium leading-none">{option.label}</span>
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
