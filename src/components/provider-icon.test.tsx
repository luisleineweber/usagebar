import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ProviderIcon } from "@/components/provider-icon"

describe("ProviderIcon", () => {
  it("renders multicolor provider artwork as an image", () => {
    render(
      <ProviderIcon
        iconUrl="qoder.svg"
        iconColorMode="multicolor"
        label="Qoder"
        className="size-6"
      />
    )

    const icon = screen.getByRole("img", { name: "Qoder" })
    expect(icon.tagName).toBe("IMG")
    expect(icon).toHaveAttribute("src", "qoder.svg")
    expect(icon).not.toHaveStyle({ maskImage: "url(qoder.svg)" })
  })

  it("uses the dark multicolor asset in dark mode", () => {
    render(
      <ProviderIcon
        iconUrl="qoder.svg"
        darkIconUrl="qoder-dark.svg"
        iconColorMode="multicolor"
        isDark
        label="Qoder"
        className="size-6"
      />
    )

    expect(screen.getByRole("img", { name: "Qoder" })).toHaveAttribute("src", "qoder-dark.svg")
  })

  it("keeps monochrome provider artwork on the brand-color mask path", () => {
    render(
      <ProviderIcon
        iconUrl="codex.svg"
        iconColorMode="monochrome"
        brandColor="#74AA9C"
        label="Codex"
        className="size-6"
      />
    )

    const icon = screen.getByRole("img", { name: "Codex" })
    expect(icon.tagName).toBe("SPAN")
    expect(icon).toHaveStyle({ maskImage: "url(codex.svg)" })
    expect(icon).toHaveStyle({ backgroundColor: "rgb(116, 170, 156)" })
  })

  it("uses black in light mode and white in dark mode for a monochrome black brand", () => {
    const { rerender } = render(
      <ProviderIcon
        iconUrl="codex.svg"
        brandColor="#000000"
        isDark={false}
        label="Codex"
        className="size-6"
      />
    )

    const icon = screen.getByRole("img", { name: "Codex" })
    expect(icon).toHaveStyle({ backgroundColor: "rgb(0, 0, 0)" })

    rerender(
      <ProviderIcon
        iconUrl="codex.svg"
        brandColor="#000000"
        isDark
        label="Codex"
        className="size-6"
      />
    )

    expect(icon).toHaveStyle({ backgroundColor: "rgb(255, 255, 255)" })
  })

  it("preserves a rectangular wordmark when natural fit is requested", () => {
    render(
      <ProviderIcon
        iconUrl="openai-api.svg"
        iconAspectRatio={86 / 24}
        fit="natural"
        brandColor="#000000"
        label="OpenAI API"
        className="size-4"
      />
    )

    const icon = screen.getByRole("img", { name: "OpenAI API" })
    expect(icon).toHaveStyle({ width: "auto" })
  })
})
