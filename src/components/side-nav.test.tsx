import { fireEvent, render, screen } from "@testing-library/react"
import type { DragEndEvent } from "@dnd-kit/core"
import type { ReactNode } from "react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"

import { SideNav } from "@/components/side-nav"

type MockSensor = { name?: string }
type MockSensorOptions = { activationConstraint?: { distance?: number } }

const darkModeState = vi.hoisted(() => ({
  useDarkModeMock: vi.fn(() => false),
}))

const dndState = vi.hoisted(() => ({
  latestOnDragEnd: null as null | ((event: DragEndEvent) => void),
}))

vi.mock("@/hooks/use-dark-mode", () => ({
  useDarkMode: darkModeState.useDarkModeMock,
}))

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: ReactNode
    onDragEnd?: (event: DragEndEvent) => void
  }) => {
    dndState.latestOnDragEnd = onDragEnd ?? null
    return <div>{children}</div>
  },
  closestCenter: vi.fn(),
  PointerSensor: class {},
  useSensor: vi.fn((_sensor: MockSensor, options?: MockSensorOptions) => ({
    sensor: _sensor,
    options,
  })),
  useSensors: vi.fn((...sensors: MockSensor[]) => sensors),
}))

vi.mock("@dnd-kit/sortable", () => ({
  arrayMove: (items: unknown[], from: number, to: number) => {
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
  },
  SortableContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: vi.fn(),
}))

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}))

describe("SideNav", () => {
  it("calls onViewChange for Home and opens settings separately", async () => {
    const onViewChange = vi.fn()
    const onOpenSettings = vi.fn()
    render(
      <SideNav
        activeView="home"
        onViewChange={onViewChange}
        onOpenSettings={onOpenSettings}
        plugins={[]}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: "Settings" }))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole("button", { name: "Home" }))
    expect(onViewChange).toHaveBeenCalledWith("home")
  })

  it("renders plugin icon button and uses brand color when appropriate", () => {
    const onViewChange = vi.fn()
    render(
      <SideNav
        activeView="home"
        onViewChange={onViewChange}
        plugins={[{ id: "p1", name: "Plugin 1", iconUrl: "icon.svg", brandColor: "#ff0000" }]}
      />
    )

    const btn = screen.getByRole("button", { name: "Plugin 1" })
    expect(btn).toBeInTheDocument()

    const icon = screen.getByRole("img", { name: "Plugin 1" })
    expect(icon).toHaveStyle({ backgroundColor: "#ff0000" })
  })

  it("renders multicolor plugin artwork without applying a mask", () => {
    render(
      <SideNav
        activeView="home"
        onViewChange={() => {}}
        plugins={[
          { id: "qoder", name: "Qoder", iconUrl: "qoder.svg", iconColorMode: "multicolor" },
        ]}
      />
    )

    const icon = screen.getByRole("img", { name: "Qoder" })
    expect(icon.tagName).toBe("IMG")
    expect(icon).toHaveAttribute("src", "qoder.svg")
    expect(icon).not.toHaveStyle({ maskImage: "url(qoder.svg)" })
  })

  it("keeps inactive provider icons at full opacity", () => {
    render(
      <SideNav
        activeView="home"
        onViewChange={() => {}}
        plugins={[{ id: "p", name: "P", iconUrl: "icon.svg", brandColor: "#ff0000" }]}
      />
    )

    expect(screen.getByRole("img", { name: "P" })).not.toHaveClass("opacity-70")
  })

  it("falls back to currentColor (light) or white (dark) for low-contrast brand colors", () => {
    const onViewChange = vi.fn()

    // Light mode + very light color => currentColor
    darkModeState.useDarkModeMock.mockReturnValueOnce(false)
    const { rerender } = render(
      <SideNav
        activeView="home"
        onViewChange={onViewChange}
        plugins={[{ id: "p", name: "P", iconUrl: "icon.svg", brandColor: "#ffffff" }]}
      />
    )
    const pStyle = screen.getByRole("img", { name: "P" }).getAttribute("style") ?? ""
    expect(pStyle).toMatch(/background-color:\s*currentcolor/i)

    // Dark mode + very dark color => white
    darkModeState.useDarkModeMock.mockReturnValueOnce(true)
    rerender(
      <SideNav
        activeView="home"
        onViewChange={onViewChange}
        plugins={[{ id: "p2", name: "P2", iconUrl: "icon.svg", brandColor: "#000000" }]}
      />
    )
    const p2Style = screen.getByRole("img", { name: "P2" }).getAttribute("style") ?? ""
    expect(p2Style).toContain("rgb(255, 255, 255)")
  })

  it("calls onReorder when drag order changes", () => {
    const onReorder = vi.fn()
    render(
      <SideNav
        activeView="home"
        onViewChange={() => {}}
        onReorder={onReorder}
        plugins={[
          { id: "a", name: "A", iconUrl: "a.svg" },
          { id: "b", name: "B", iconUrl: "b.svg" },
        ]}
      />
    )

    dndState.latestOnDragEnd?.({ active: { id: "a" }, over: { id: "b" } })
    expect(onReorder).toHaveBeenCalledWith(["b", "a"])
  })

  it("renders only Home and Settings actions when there are no plugins", () => {
    render(<SideNav activeView="home" onViewChange={() => {}} plugins={[]} />)

    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Help" })).not.toBeInTheDocument()
    expect(invoke).not.toHaveBeenCalled()
  })

  it("omits History when it is disabled in bar settings", () => {
    render(
      <SideNav activeView="home" onViewChange={() => {}} showHistoryInBar={false} plugins={[]} />
    )

    expect(screen.queryByRole("button", { name: "History" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument()
  })

  it("keeps Settings pinned when the provider list exceeds the panel height", () => {
    render(
      <SideNav
        activeView="home"
        onViewChange={() => {}}
        plugins={Array.from({ length: 20 }, (_, index) => ({
          id: `provider-${index}`,
          name: `Provider ${index}`,
          iconUrl: "icon.svg",
        }))}
      />
    )

    expect(screen.getByRole("navigation")).toHaveClass("h-full", "min-h-0", "shrink-0")
    expect(screen.getByRole("button", { name: "Settings" })).toHaveClass("shrink-0")
    expect(screen.getByTestId("provider-list")).toHaveClass("h-full", "min-h-0", "overflow-y-auto")
    expect(screen.getByTestId("side-nav-footer")).toHaveClass(
      "mt-2",
      "border-t",
      "pt-2",
      "shrink-0"
    )
  })

  it("shows a scroll hint when providers remain below the visible list", () => {
    render(
      <SideNav
        activeView="home"
        onViewChange={() => {}}
        plugins={[{ id: "a", name: "A", iconUrl: "a.svg" }]}
      />
    )

    const list = screen.getByTestId("provider-list")
    Object.defineProperties(list, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 200 },
    })

    fireEvent.scroll(list)

    expect(screen.getByTestId("provider-scroll-indicator")).toBeInTheDocument()

    Object.defineProperty(list, "scrollTop", { configurable: true, value: 100 })
    fireEvent.scroll(list)

    expect(screen.queryByTestId("provider-scroll-indicator")).not.toBeInTheDocument()
  })
})
