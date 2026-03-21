import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ChangelogDialog } from "@/components/changelog-dialog"
import {
  PROJECT_COMMIT_URL_PREFIX,
  PROJECT_PULL_URL_PREFIX,
  PROJECT_RELEASES_URL,
} from "@/lib/project-metadata"

const openerState = vi.hoisted(() => ({
  openUrlMock: vi.fn(() => Promise.resolve()),
}))

const changelogState = vi.hoisted(() => ({
  releases: [] as import("@/hooks/use-changelog").Release[],
  loading: false,
  error: null as string | null,
}))

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openerState.openUrlMock,
}))

vi.mock("@/hooks/use-changelog", () => ({
  useChangelog: () => changelogState,
}))

describe("ChangelogDialog", () => {
  beforeEach(() => {
    changelogState.releases = []
    changelogState.loading = false
    changelogState.error = null
    openerState.openUrlMock.mockClear()
  })

  it("renders loading state", () => {
    changelogState.loading = true

    render(<ChangelogDialog currentVersion="1.0.0" onBack={() => {}} onClose={() => {}} />)

    expect(screen.getByText("Fetching release info...")).toBeInTheDocument()
  })

  it("renders error state", () => {
    changelogState.error = "something went wrong"

    render(<ChangelogDialog currentVersion="1.0.0" onBack={() => {}} onClose={() => {}} />)

    expect(screen.getByText("Failed to load release notes")).toBeInTheDocument()
    expect(screen.getByText("something went wrong")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument()
  })

  it("renders current release and opens repo-specific links", async () => {
    changelogState.releases = [
      {
        id: 1,
        tag_name: "v1.2.3",
        name: "v1.2.3",
        body:
          "Intro\n\n## Heading\n- item\nPR #123 by @user in commit abcdef1\nSee [docs](https://example.com/docs) and https://example.com/plain",
        published_at: "2024-01-02T00:00:00Z",
        html_url: `${PROJECT_RELEASES_URL}/tag/v1.2.3`,
      },
    ]

    render(<ChangelogDialog currentVersion="1.2.3" onBack={() => {}} onClose={() => {}} />)

    expect(screen.getByText("v1.2.3")).toBeInTheDocument()
    expect(screen.getByText("Intro")).toBeInTheDocument()
    expect(screen.getByText("Heading")).toBeInTheDocument()
    expect(screen.getByText("item")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "GitHub" }))
    expect(openerState.openUrlMock).toHaveBeenCalledWith(`${PROJECT_RELEASES_URL}/tag/v1.2.3`)

    openerState.openUrlMock.mockClear()
    await userEvent.click(screen.getByRole("button", { name: "docs" }))
    expect(openerState.openUrlMock).toHaveBeenCalledWith("https://example.com/docs")

    openerState.openUrlMock.mockClear()
    await userEvent.click(screen.getByRole("button", { name: "#123" }))
    expect(openerState.openUrlMock).toHaveBeenCalledWith(`${PROJECT_PULL_URL_PREFIX}123`)

    openerState.openUrlMock.mockClear()
    await userEvent.click(screen.getByRole("button", { name: "@user" }))
    expect(openerState.openUrlMock).toHaveBeenCalledWith("https://github.com/user")

    openerState.openUrlMock.mockClear()
    await userEvent.click(screen.getByRole("button", { name: "abcdef1" }))
    expect(openerState.openUrlMock).toHaveBeenCalledWith(`${PROJECT_COMMIT_URL_PREFIX}abcdef1`)

    openerState.openUrlMock.mockClear()
    await userEvent.click(screen.getByRole("button", { name: "https://example.com/plain" }))
    expect(openerState.openUrlMock).toHaveBeenCalledWith("https://example.com/plain")
  })

  it("handles null body and null published date", () => {
    changelogState.releases = [
      {
        id: 1,
        tag_name: "v1.0.0",
        name: "v1.0.0",
        body: null,
        published_at: null,
        html_url: `${PROJECT_RELEASES_URL}/tag/v1.0.0`,
      },
    ]

    render(<ChangelogDialog currentVersion="1.0.0" onBack={() => {}} onClose={() => {}} />)

    expect(screen.getByText("v1.0.0")).toBeInTheDocument()
    expect(screen.getByText("Unpublished release")).toBeInTheDocument()
  })

  it("shows fallback when no current release is found", async () => {
    changelogState.releases = [
      {
        id: 1,
        tag_name: "v0.1.0",
        name: "v0.1.0",
        body: "old",
        published_at: "2023-01-01T00:00:00Z",
        html_url: `${PROJECT_RELEASES_URL}/tag/v0.1.0`,
      },
    ]

    render(<ChangelogDialog currentVersion="9.9.9" onBack={() => {}} onClose={() => {}} />)

    expect(screen.getByText("No specific notes for v9.9.9")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "View all releases on GitHub" }))
    expect(openerState.openUrlMock).toHaveBeenCalledWith(PROJECT_RELEASES_URL)
  })

  it("invokes navigation callbacks and closes on Escape", async () => {
    const onBack = vi.fn()
    const onClose = vi.fn()
    changelogState.releases = [
      {
        id: 1,
        tag_name: "v1.0.0",
        name: "v1.0.0",
        body: "body",
        published_at: "2024-01-02T00:00:00Z",
        html_url: `${PROJECT_RELEASES_URL}/tag/v1.0.0`,
      },
    ]

    render(<ChangelogDialog currentVersion="1.0.0" onBack={onBack} onClose={onClose} />)

    await userEvent.click(screen.getByTitle("Back"))
    expect(onBack).toHaveBeenCalled()

    await userEvent.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
