import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function mockCookie(ctx, cookieHeader = "session=abc123") {
  ctx.host.providerSecrets.read.mockImplementation((key) => (key === "cookieHeader" ? cookieHeader : null))
}

function response(bodyText, status = 200, headers = {}) {
  return { status, headers, bodyText }
}

function expectProgress(result, label) {
  const line = result.lines.find((item) => item.label === label)
  expect(line).toBeTruthy()
  expect(line.type).toBe("progress")
  return line
}

describe("ollama plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("throws when no cookie header is stored", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow("Paste your Ollama Cookie header in Setup before refreshing.")
  })

  it("surfaces when saved metadata exists but the vault entry is missing", async () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read.mockImplementation(() => {
      throw new Error("provider secret not found")
    })

    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow(
      "Stored Ollama cookie header was not found in the system credential vault. Save it again in Setup before refreshing."
    )
  })

  it("surfaces credential vault read failures directly", async () => {
    const ctx = makeCtx()
    ctx.host.providerSecrets.read.mockImplementation(() => {
      throw new Error("credential read failed: Access is denied. (os error 5)")
    })

    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow(
      "Could not read the stored Ollama cookie header from the system credential vault: Error: credential read failed: Access is denied. (os error 5)"
    )
  })

  it("requests the Ollama settings page with cookie headers", async () => {
    const ctx = makeCtx()
    mockCookie(ctx, "session=abc123; theme=dark")
    ctx.host.http.request.mockReturnValue(
      response(`
        <span>Cloud Usage</span><span>Free</span>
        <div>Session usage</div>
        <div>12% used</div>
      `)
    )

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledWith(expect.objectContaining({
      method: "GET",
      url: "https://ollama.com/settings",
      headers: expect.objectContaining({
        Cookie: "session=abc123; theme=dark",
        Origin: "https://ollama.com",
        Referer: "https://ollama.com/settings",
      }),
    }))
  })

  it("parses plan, session, weekly, and reset timestamps from settings HTML", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    ctx.host.http.request.mockReturnValue(
      response(`
        <section>
          <span>Cloud Usage</span><span>Pro</span>
          <div>Session usage</div>
          <div>12% used <span data-time="2026-03-10T12:00:00Z">Resets in</span></div>
          <div>Weekly usage</div>
          <div><div style="width: 34%"></div><span data-time="2026-03-15T00:00:00Z">Resets in</span></div>
        </section>
      `)
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Pro")
    const session = expectProgress(result, "Session")
    expect(session.used).toBe(12)
    expect(session.limit).toBe(100)
    expect(session.resetsAt).toBe("2026-03-10T12:00:00.000Z")
    expect(session.periodDurationMs).toBe(5 * 60 * 60 * 1000)

    const weekly = expectProgress(result, "Weekly")
    expect(weekly.used).toBe(34)
    expect(weekly.resetsAt).toBe("2026-03-15T00:00:00.000Z")
    expect(weekly.periodDurationMs).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it("accepts Hourly usage as the session source label", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    ctx.host.http.request.mockReturnValue(
      response(`
        <span>Cloud Usage</span><span>Max</span>
        <div>Hourly usage</div>
        <div><div style="width: 45%"></div></div>
      `)
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Max")
    expectProgress(result, "Session")
    expect(result.lines.find((item) => item.label === "Weekly")).toBeUndefined()
  })

  it("returns session without weekly when weekly usage is absent", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    ctx.host.http.request.mockReturnValue(
      response(`
        <span>Cloud Usage</span><span>Free</span>
        <div>Session usage</div>
        <div>8% used</div>
      `)
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines).toHaveLength(1)
    expectProgress(result, "Session")
  })

  it("throws on expired session status codes", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    ctx.host.http.request.mockReturnValue(response("", 401))

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Ollama session cookie expired")
  })

  it("throws on auth redirects", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    ctx.host.http.request.mockReturnValue(response("", 302, { location: "/auth/signin" }))

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Not logged in to Ollama")
  })

  it("throws on signed-out HTML", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    ctx.host.http.request.mockReturnValue(
      response(`
        <html>
          <h1>Sign in to Ollama</h1>
          <form action="/login">
            <input type="email" />
            <input type="password" />
          </form>
        </html>
      `)
    )

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Not logged in to Ollama")
  })

  it("throws parse error when no session bar is present", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    ctx.host.http.request.mockReturnValue(
      response(`
        <span>Cloud Usage</span><span>Pro</span>
        <div>No usage data rendered.</div>
      `)
    )

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Could not parse Ollama usage.")
  })

  it("keeps resetsAt undefined when data-time is absent", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    ctx.host.http.request.mockReturnValue(
      response(`
        <span>Cloud Usage</span><span>Pro</span>
        <div>Session usage</div>
        <div>17% used</div>
      `)
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const session = expectProgress(result, "Session")
    expect(session.resetsAt).toBeUndefined()
  })
})
