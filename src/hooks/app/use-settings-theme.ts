import { useEffect } from "react"
import { getDisplayAccentColor, type AccentColor, type ThemeMode } from "@/lib/settings"

export function useSettingsTheme(themeMode: ThemeMode, accentColor: AccentColor) {
  useEffect(() => {
    const root = document.documentElement
    const apply = (dark: boolean) => {
      root.classList.toggle("dark", dark)
      root.style.setProperty("--page-accent", getDisplayAccentColor(accentColor, dark))
    }

    if (themeMode === "light") {
      apply(false)
      return
    }
    if (themeMode === "dark") {
      apply(true)
      return
    }

    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    apply(mq.matches)
    const handler = (e: MediaQueryListEvent) => apply(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [accentColor, themeMode])
}
