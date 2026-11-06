import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewPage } from "@/pages/overview";

describe("OverviewPage", () => {
  it("renders empty state", () => {
    render(
      <OverviewPage
        plugins={[]}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    );
    expect(screen.getByText("No active providers yet.")).toBeInTheDocument();
  });

  it("shows a loading state instead of the empty state while providers load", () => {
    render(
      <OverviewPage
        plugins={[]}
        hasResolvedViews={false}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading providers");
    expect(screen.queryByText("No active providers yet.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set up a provider" })).not.toBeInTheDocument();
  });

  it("renders provider cards", () => {
    const plugins = [
      {
        meta: { id: "a", name: "Alpha", iconUrl: "icon", lines: [] },
        data: {
          providerId: "a",
          displayName: "Alpha",
          lines: [],
          iconUrl: "icon",
        },
        loading: false,
        error: null,
        lastManualRefreshAt: null,
      },
    ];
    render(
      <OverviewPage
        plugins={plugins}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("shows no plan badge until the provider reports a plan", () => {
    render(
      <OverviewPage
        plugins={[
          {
            meta: { id: "a", name: "Alpha", iconUrl: "icon", lines: [] },
            data: null,
            loading: false,
            error: "Not connected",
            lastManualRefreshAt: null,
          },
        ]}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    );

    expect(screen.queryByText("Free")).not.toBeInTheDocument();
  });

  it("keeps the last reported plan while the provider has an error", () => {
    render(
      <OverviewPage
        plugins={[
          {
            meta: { id: "a", name: "Alpha", iconUrl: "icon", lines: [] },
            data: null,
            lastSettledData: {
              providerId: "a",
              displayName: "Alpha",
              plan: "Pro",
              lines: [{ type: "text", label: "Status", value: "ok" }],
              iconUrl: "icon",
            },
            loading: false,
            error: "Token expired",
            lastManualRefreshAt: null,
          },
        ]}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    );

    expect(screen.getByText("Pro")).toBeInTheDocument();
  });

  it("only shows overview-scoped lines", () => {
    const plugins = [
      {
        meta: {
          id: "test",
          name: "Test",
          iconUrl: "icon",
          lines: [
            {
              type: "text" as const,
              label: "Primary",
              scope: "overview" as const,
            },
            {
              type: "text" as const,
              label: "Secondary",
              scope: "detail" as const,
            },
          ],
        },
        data: {
          providerId: "test",
          displayName: "Test",
          lines: [
            { type: "text" as const, label: "Primary", value: "Shown" },
            { type: "text" as const, label: "Secondary", value: "Hidden" },
          ],
          iconUrl: "icon",
        },
        loading: false,
        error: null,
        lastManualRefreshAt: null,
      },
    ];
    render(
      <OverviewPage
        plugins={plugins}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    );
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getByText("Shown")).toBeInTheDocument();
    expect(screen.queryByText("Secondary")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("does not show provider quick links in combined view", () => {
    const plugins = [
      {
        meta: {
          id: "alpha",
          name: "Alpha",
          iconUrl: "icon",
          lines: [],
          links: [{ label: "Status", url: "https://status.example.com" }],
        },
        data: {
          providerId: "alpha",
          displayName: "Alpha",
          lines: [],
          iconUrl: "icon",
        },
        loading: false,
        error: null,
        lastManualRefreshAt: null,
      },
    ];

    render(
      <OverviewPage
        plugins={plugins}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    );
    expect(screen.queryByRole("button", { name: /status/i })).toBeNull();
  });
});
