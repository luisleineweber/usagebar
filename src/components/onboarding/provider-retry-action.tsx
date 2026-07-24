import { useEffect, useRef, useState } from "react"
import { ChevronDown, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

type ProviderRetryActionProps = {
  providerName: string
  onRetry: () => void
  onRemove: () => void
}

export function ProviderRetryAction({ providerName, onRetry, onRemove }: ProviderRetryActionProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const closeMenu = (event: PointerEvent) => {
      if (!menuRootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false)
    }

    document.addEventListener("pointerdown", closeMenu)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeMenu)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [isOpen])

  return (
    <div ref={menuRootRef} className="relative inline-flex shrink-0">
      <div className="inline-flex">
        <Button variant="outline" size="sm" className="rounded-r-none border-r-0" onClick={onRetry}>
          <RefreshCw />
          Erneut prüfen
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-l-none px-2"
          aria-label={`${providerName} weitere Aktionen`}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          <ChevronDown />
        </Button>
      </div>
      {isOpen ? (
        <div
          role="menu"
          aria-label={`${providerName} Aktionen`}
          className="absolute right-0 top-full z-20 mt-1 min-w-40 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            className="w-full rounded-sm px-2.5 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
            onClick={() => {
              setIsOpen(false)
              onRemove()
            }}
          >
            Provider entfernen
          </button>
        </div>
      ) : null}
    </div>
  )
}
