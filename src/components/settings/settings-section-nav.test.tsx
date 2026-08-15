import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SettingsSectionNav } from "@/components/settings/settings-section-nav"

const sections = [
  { id: "appearance", label: "Appearance" },
  { id: "notifications", label: "Notifications" },
]

describe("SettingsSectionNav", () => {
  let intersectionCallback: IntersectionObserverCallback
  const observe = vi.fn()
  const disconnect = vi.fn()

  beforeEach(() => {
    class IntersectionObserverMock {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback
      }

      observe = observe
      disconnect = disconnect
      unobserve = vi.fn()
      takeRecords = vi.fn(() => [])
      root = null
      rootMargin = ""
      thresholds = []
    }

    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function renderNavigation() {
    return render(
      <>
        <SettingsSectionNav sections={sections} />
        <section id="appearance" />
        <section id="notifications" />
      </>
    )
  }

  it("tracks the first visible section and disconnects the observer", () => {
    const { unmount } = renderNavigation()

    expect(observe).toHaveBeenCalledTimes(2)
    act(() => {
      intersectionCallback(
        [
          {
            isIntersecting: true,
            target: document.getElementById("appearance"),
            boundingClientRect: { top: 200 },
          },
          {
            isIntersecting: true,
            target: document.getElementById("notifications"),
            boundingClientRect: { top: 100 },
          },
        ] as IntersectionObserverEntry[],
        {} as IntersectionObserver
      )
    })

    expect(screen.getByRole("button", { name: "Notifications" })).toHaveAttribute(
      "aria-current",
      "location"
    )
    unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it("uses smooth scrolling for button navigation and auto scrolling for reduced motion", () => {
    renderNavigation()
    const appearance = document.getElementById("appearance")!
    const notifications = document.getElementById("notifications")!
    appearance.scrollIntoView = vi.fn()
    notifications.scrollIntoView = vi.fn()
    const matchMedia = vi.spyOn(window, "matchMedia")

    matchMedia.mockReturnValue({ matches: false } as MediaQueryList)
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }))
    expect(appearance.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" })

    matchMedia.mockReturnValue({ matches: true } as MediaQueryList)
    fireEvent.change(screen.getByRole("combobox", { name: "Jump to settings section" }), {
      target: { value: "notifications" },
    })
    expect(notifications.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" })
  })

  it("handles empty sections and missing targets", () => {
    const { rerender } = render(<SettingsSectionNav sections={[]} />)
    expect(observe).not.toHaveBeenCalled()

    rerender(<SettingsSectionNav sections={[{ id: "missing", label: "Missing" }]} />)
    fireEvent.click(screen.getByRole("button", { name: "Missing" }))
    expect(observe).not.toHaveBeenCalled()
  })
})
