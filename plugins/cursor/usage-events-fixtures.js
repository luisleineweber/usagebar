import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

export const EVENTS_PATH = "/api/dashboard/get-filtered-usage-events"
export const PAGE_SIZE = 500
export const SCHEDULE_PATH = "/tmp/openusage-test/plugin/usage-history-schedule.json"
export const USER_ID = "user_abc123"
// Europe/Berlin has a UTC offset and a daylight saving change inside the test window.
export const TIME_ZONE = "Europe/Berlin"

export const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

// Dates are built on demand, after the test time zone is in effect.
export function now() {
  return new Date(2026, 10, 17, 15, 30)
}

export function localTime(month, day, hour, minute = 0) {
  return new Date(2026, month - 1, day, hour, minute).getTime()
}

export function localNoon(day) {
  return localTime(11, day, 12)
}

export function useUsageEventTestEnvironment() {
  let previousTimeZone
  beforeAll(() => {
    previousTimeZone = process.env.TZ
    process.env.TZ = TIME_ZONE
  })
  afterAll(() => {
    if (previousTimeZone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimeZone
  })
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(now())
  })
  afterEach(() => {
    vi.useRealTimers()
  })
}

function makeJwt(payload) {
  const jwtPayload = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/=+$/g, "")
  return `a.${jwtPayload}.c`
}

export function event(overrides = {}) {
  const { tokenUsage, ...rest } = overrides
  return {
    timestamp: String(localNoon(16)),
    model: "claude-4.5-sonnet",
    kind: "USAGE_EVENT_KIND_INCLUDED_IN_PRO",
    chargedCents: 4,
    tokenUsage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheWriteTokens: 10,
      cacheReadTokens: 5,
      totalCents: 25,
      ...tokenUsage,
    },
    ...rest,
  }
}

export function uniqueEvents(count, startIndex = 0) {
  return Array.from({ length: count }, (_, index) =>
    event({ timestamp: String(localNoon(16) + startIndex + index) })
  )
}

export function eventsPage(events, total) {
  const body = { usageEventsDisplay: events }
  if (total !== undefined) body.totalUsageEventsCount = total
  return { status: 200, headers: {}, bodyText: JSON.stringify(body) }
}

// Makes the Cursor app state hold an access token for this user.
export function signInAs(ctx, userId) {
  const token = makeJwt({
    sub: "auth0|" + userId,
    exp: Math.floor(Date.now() / 1000) + 24 * 3600,
  })
  ctx.host.sqlite.query.mockImplementation((db, sql) =>
    String(sql).includes("cursorAuth/accessToken") ? JSON.stringify([{ value: token }]) : "[]"
  )
}

export function setup(respondToEvents) {
  const ctx = makeCtx()
  signInAs(ctx, USER_ID)
  const eventRequests = []
  ctx.host.http.request.mockImplementation((opts) => {
    const url = String(opts.url)
    if (url.includes(EVENTS_PATH)) {
      const body = JSON.parse(opts.bodyText)
      eventRequests.push({ opts, body })
      return respondToEvents(body.page, body, opts)
    }
    if (url.includes("GetCurrentPeriodUsage")) {
      return {
        status: 200,
        bodyText: JSON.stringify({
          enabled: true,
          planUsage: { totalSpend: 1200, limit: 2400 },
          billingCycleEnd: Date.now() + 86400000,
        }),
      }
    }
    if (url.includes("GetPlanInfo")) {
      return { status: 200, bodyText: JSON.stringify({ planInfo: { planName: "pro" } }) }
    }
    return { status: 404, bodyText: "{}" }
  })
  return { ctx, eventRequests }
}

export function hasTotalUsage(result) {
  return Boolean(result.lines.find((line) => line.label === "Total usage"))
}
