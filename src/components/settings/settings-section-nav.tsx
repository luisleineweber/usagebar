import { useEffect, useState } from "react"

export type SettingsSection = {
  id: string
  label: string
}

type SettingsSectionNavProps = {
  sections: SettingsSection[]
}

export function SettingsSectionNav({ sections }: SettingsSectionNavProps) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? "")

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    const elements = sections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => element !== null)
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]?.target.id) setActiveSection(visible[0].target.id)
      },
      { rootMargin: "-12% 0px -70% 0px", threshold: [0, 1] }
    )
    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [sections])

  const jumpTo = (id: string) => {
    setActiveSection(id)
    const target = document.getElementById(id)
    if (!target) return
    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" })
    }
  }

  return (
    <nav
      aria-label="General settings sections"
      className="sticky top-0 z-10 -mx-1 bg-background/95 py-2 backdrop-blur xl:top-4 xl:float-left xl:mr-8 xl:w-44 xl:bg-transparent xl:py-0"
    >
      <div className="hidden space-y-1 xl:block">
        <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Sections
        </p>
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
              activeSection === section.id
                ? "bg-muted text-foreground font-medium"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
            aria-current={activeSection === section.id ? "location" : undefined}
            onClick={() => jumpTo(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-3 px-1 text-sm xl:hidden">
        <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Jump to
        </span>
        <select
          value={activeSection}
          aria-label="Jump to settings section"
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          onChange={(event) => jumpTo(event.target.value)}
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}
            </option>
          ))}
        </select>
      </label>
    </nav>
  )
}
