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
})
