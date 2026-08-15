import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SurfacePinWidget, resolveSurfacePins } from "@/components/surface-pin-widget"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import type { SurfacePin } from "@/lib/settings"

const plugins: DisplayPluginState[] = [
  {
    meta: { id: "codex", name: "Codex", iconUrl: "", lines: [] },
    data: {
      providerId: "codex",
      displayName: "Codex",
      iconUrl: "",
      lines: [
        { type: "progress", label: "Session", used: 42, limit: 100, format: { kind: "percent" } },
      ],
    },
    loading: false,
    error: null,
    lastManualRefreshAt: null,
    lastSuccessAt: null,
  },
]

const pins: SurfacePin[] = [
  { providerId: "missing", metricLabel: "Weekly", presentation: "bar" },
  { providerId: "codex", metricLabel: "Session", presentation: "text" },
]

describe("SurfacePinWidget", () => {
  it("resolves only visible providers while preserving pin presentation", () => {
    expect(resolveSurfacePins({ pins, plugins, displayMode: "used" })).toEqual([
      {
        pin: { providerId: "codex", metricLabel: "Session", presentation: "text" },
        providerName: "Codex",
        percent: 42,
      },
    ])
  })

  it("renders text pins without a bar and bar pins with accessible progress", () => {
    const { rerender } = render(
      <SurfacePinWidget pins={pins} plugins={plugins} displayMode="used" />
    )

    expect(screen.getByText("Codex: Session")).toBeInTheDocument()
    expect(screen.getByText("42%")).toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()

    rerender(
      <SurfacePinWidget
        pins={[{ ...pins[1]!, presentation: "bar" }]}
        plugins={plugins}
        displayMode="left"
      />
    )
    expect(screen.getByRole("progressbar", { name: "Codex Session" })).toHaveAttribute(
      "aria-valuenow",
      "58"
    )
  })

  it("does not resolve an account-specific pin against another account", () => {
    const accountA: DisplayPluginState = {
      ...plugins[0]!,
      data: {
        ...plugins[0]!.data!,
        instanceRef: { providerId: "codex", instanceId: "profile-a" },
      },
    }
    const accountBPin: SurfacePin = {
      providerId: "codex",
      instanceRef: { providerId: "codex", instanceId: "profile-b" },
      metricLabel: "Session",
      presentation: "bar",
    }

    expect(
      resolveSurfacePins({ pins: [accountBPin], plugins: [accountA], displayMode: "used" })
    ).toEqual([{ pin: accountBPin, providerName: "Codex", percent: null }])
  })

  it("does not turn an unknown quota into zero", () => {
    const unknownPlugin = {
      ...plugins[0]!,
      data: {
        ...plugins[0]!.data!,
        lines: [
          {
            type: "progress" as const,
            label: "Session",
            used: null,
            limit: 100,
            format: { kind: "percent" as const },
          },
        ],
      },
    }

    render(
      <SurfacePinWidget
        pins={[{ ...pins[1]!, presentation: "bar" }]}
        plugins={[unknownPlugin]}
        displayMode="used"
      />
    )

    expect(screen.getByText("—")).toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })
})
