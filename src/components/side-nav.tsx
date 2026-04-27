import { useCallback } from "react"
import { Check, GripVertical, Settings } from "lucide-react"
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/lib/utils"
import { getRelativeLuminance } from "@/lib/color"
import { useDarkMode } from "@/hooks/use-dark-mode"

function GaugeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4ZM15.8329 7.33748C16.0697 7.17128 16.3916 7.19926 16.5962 7.40381C16.8002 7.60784 16.8267 7.92955 16.6587 8.16418C14.479 11.2095 13.2796 12.8417 13.0607 13.0607C12.4749 13.6464 11.5251 13.6464 10.9393 13.0607C10.3536 12.4749 10.3536 11.5251 10.9393 10.9393C11.3126 10.5661 12.9438 9.36549 15.8329 7.33748ZM17.5 11C18.0523 11 18.5 11.4477 18.5 12C18.5 12.5523 18.0523 13 17.5 13C16.9477 13 16.5 12.5523 16.5 12C16.5 11.4477 16.9477 11 17.5 11ZM6.5 11C7.05228 11 7.5 11.4477 7.5 12C7.5 12.5523 7.05228 13 6.5 13C5.94772 13 5.5 12.5523 5.5 12C5.5 11.4477 5.94772 11 6.5 11ZM8.81802 7.40381C9.20854 7.79433 9.20854 8.4275 8.81802 8.81802C8.4275 9.20854 7.79433 9.20854 7.40381 8.81802C7.01328 8.4275 7.01328 7.79433 7.40381 7.40381C7.79433 7.01328 8.4275 7.01328 8.81802 7.40381ZM12 5.5C12.5523 5.5 13 5.94772 13 6.5C13 7.05228 12.5523 7.5 12 7.5C11.4477 7.5 11 7.05228 11 6.5C11 5.94772 11.4477 5.5 12 5.5Z" />
    </svg>
  )
}

type ActiveView = "home" | string

type PluginContextAction = "reload" | "remove" | "arrange"

interface NavPlugin {
  id: string
  name: string
  iconUrl: string
  brandColor?: string
  supportState?: "supported" | "experimental" | "comingSoonOnWindows"
  supportMessage?: string | null
}

interface SideNavProps {
  activeView: ActiveView
  onViewChange: (view: ActiveView) => void
  plugins: NavPlugin[]
  onOpenSettings?: () => void
  onReorder?: (orderedIds: string[]) => void
  arrangeMode?: boolean
  onArrangeModeChange?: (enabled: boolean) => void
  onOpenContextMenu?: (event: React.MouseEvent, pluginId?: string) => void
}

interface NavButtonProps {
  isActive: boolean
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  children: React.ReactNode
  "aria-label"?: string
}

function NavButton({ isActive, onClick, onContextMenu, children, "aria-label": ariaLabel }: NavButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-label={ariaLabel}
      className={cn(
        "relative flex items-center justify-center w-full p-2.5 transition-colors",
        "hover:bg-accent",
        isActive
          ? "text-foreground before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-primary dark:before:bg-page-accent before:rounded-full"
          : "text-muted-foreground"
      )}
    >
      {children}
    </button>
  )
}

function getIconColor(brandColor: string | undefined, isDark: boolean): string {
  if (!brandColor) return "currentColor"
  const luminance = getRelativeLuminance(brandColor)
  if (isDark && luminance < 0.15) return "#ffffff"
  if (!isDark && luminance > 0.85) return "currentColor"
  return brandColor
}

interface SortableNavPluginProps {
  plugin: NavPlugin
  isActive: boolean
  isDark: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  isArrangeMode: boolean
}

function SortableNavPlugin({
  plugin,
  isActive,
  isDark,
  onClick,
  onContextMenu,
  isArrangeMode,
}: SortableNavPluginProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plugin.id, disabled: !isArrangeMode })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : undefined,
        zIndex: isDragging ? 20 : undefined,
      }}
      {...(isArrangeMode ? attributes : {})}
      {...(isArrangeMode ? listeners : {})}
      className={cn("relative touch-none transition-[filter]", isArrangeMode && "nav-arrange-item")}
    >
      <NavButton
        isActive={isActive}
        onClick={onClick}
        onContextMenu={onContextMenu}
        aria-label={plugin.name}
      >
        {isArrangeMode ? (
          <GripVertical className="pointer-events-none absolute left-0 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/70" />
        ) : null}
        <span
          role="img"
          aria-label={plugin.name}
          title={plugin.supportState !== "supported" ? plugin.supportMessage ?? undefined : undefined}
          className={cn(
            "size-6 inline-block",
            plugin.supportState === "comingSoonOnWindows" ? "opacity-45" : ""
          )}
          style={{
            backgroundColor: getIconColor(plugin.brandColor, isDark),
            WebkitMaskImage: `url(${plugin.iconUrl})`,
            WebkitMaskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskImage: `url(${plugin.iconUrl})`,
            maskSize: "contain",
            maskRepeat: "no-repeat",
            maskPosition: "center",
          }}
        />
      </NavButton>
    </div>
  )
}

export function SideNav({
  activeView,
  onViewChange,
  plugins,
  onOpenSettings,
  onReorder,
  arrangeMode = false,
  onArrangeModeChange,
  onOpenContextMenu,
}: SideNavProps) {
  const isDark = useDarkMode()
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!onReorder) return
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIndex = plugins.findIndex((plugin) => plugin.id === active.id)
      const newIndex = plugins.findIndex((plugin) => plugin.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return
      const next = arrayMove(plugins, oldIndex, newIndex)
      onReorder(next.map((plugin) => plugin.id))
    },
    [onReorder, plugins]
  )

  const handlePluginContextMenu = useCallback(
    (event: React.MouseEvent, pluginId: string) => {
      event.preventDefault()
      event.stopPropagation()
      onOpenContextMenu?.(event, pluginId)
    },
    [onOpenContextMenu]
  )

  return (
    <nav
      className={cn("relative flex flex-col w-12 border-r bg-muted/50 dark:bg-card py-3", arrangeMode && "bg-accent/40")}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onOpenContextMenu?.(event)
      }}
    >
      <NavButton
        isActive={activeView === "home"}
        onClick={() => onViewChange("home")}
        aria-label="Home"
      >
        <GaugeIcon className="size-6 dark:text-page-accent" />
      </NavButton>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={plugins.map((plugin) => plugin.id)} strategy={verticalListSortingStrategy}>
          {plugins.map((plugin) => (
            <SortableNavPlugin
              key={plugin.id}
              plugin={plugin}
              isActive={activeView === plugin.id}
              isDark={isDark}
              onClick={() => onViewChange(plugin.id)}
              onContextMenu={(event) => handlePluginContextMenu(event, plugin.id)}
              isArrangeMode={arrangeMode}
            />
          ))}
        </SortableContext>
      </DndContext>

      {arrangeMode ? (
        <div className="px-1.5 pt-2">
          <button
            type="button"
            className="flex h-8 w-full items-center justify-center rounded-md border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-accent"
            aria-label="Provider-Anordnung fertig"
            title="Provider-Anordnung fertig"
            onClick={() => onArrangeModeChange?.(false)}
          >
            <Check className="size-4" />
          </button>
        </div>
      ) : null}

      <div className="flex-1" />

      <NavButton
        isActive={false}
        onClick={() => onOpenSettings?.()}
        aria-label="Settings"
      >
        <Settings className="size-6" />
      </NavButton>
    </nav>
  )
}

export type { ActiveView, NavPlugin, PluginContextAction }
