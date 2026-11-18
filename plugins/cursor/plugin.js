(function () {
  const KEYCHAIN_ACCESS_TOKEN_SERVICE = "cursor-access-token"
  const KEYCHAIN_REFRESH_TOKEN_SERVICE = "cursor-refresh-token"
  const BASE_URL = "https://api2.cursor.sh"
  const USAGE_URL = BASE_URL + "/aiserver.v1.DashboardService/GetCurrentPeriodUsage"
  const PLAN_URL = BASE_URL + "/aiserver.v1.DashboardService/GetPlanInfo"
  const REFRESH_URL = BASE_URL + "/oauth/token"
  const CREDITS_URL = BASE_URL + "/aiserver.v1.DashboardService/GetCreditGrantsBalance"
  const REST_USAGE_URL = "https://cursor.com/api/usage"
  const USAGE_SUMMARY_URL = "https://cursor.com/api/usage-summary"
  const STRIPE_URL = "https://cursor.com/api/auth/stripe"
  const USAGE_EVENTS_URL = "https://cursor.com/api/dashboard/get-filtered-usage-events"
  const USAGE_EVENTS_ORIGIN = "https://cursor.com"
  const USAGE_EVENTS_PAGE_SIZE = 500
  // Safety cap so a paging fault cannot loop forever (40 * 500 = 20k events per window).
  const USAGE_EVENTS_MAX_PAGES = 40
  const USAGE_EVENTS_PAGE_TIMEOUT_MS = 15000
  const USAGE_HISTORY_DAYS = 30
  // The host stops a probe after 30 s and discards its result. History paging must
  // end 20 s after probe start, so the summary always returns in time.
  const USAGE_HISTORY_BUDGET_MS = 20000
  // Do not start a page with less time than this left in the budget.
  const USAGE_HISTORY_MIN_PAGE_MS = 3000
  // History changes slowly. Between fetches, the host keeps the last valid history.
  const USAGE_HISTORY_REFRESH_MS = 30 * 60 * 1000
  // Same minimum as the Claude plugin uses after HTTP 429.
  const USAGE_HISTORY_MIN_RETRY_AFTER_MS = 5 * 60 * 1000
  const USAGE_HISTORY_MAX_RETRY_AFTER_MS = 24 * 60 * 60 * 1000
  const USAGE_HISTORY_SCHEDULE_FILE = "usage-history-schedule.json"
  const CLIENT_ID = "KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB"
  const REFRESH_BUFFER_MS = 5 * 60 * 1000 // refresh 5 minutes before expiration
  const LOGIN_HINT = "Sign in via Cursor app or run `agent login`."

  function probeError(category, message) {
    var error = new Error(message)
    error.category = category
    return error
  }

  function isProbeError(error) {
    return Boolean(error && typeof error === "object" && error.category)
  }

  function isMissingCredentialError(error) {
    var message = String(error).toLowerCase()
    return message.includes("no entry") ||
      message.includes("no matching entry found") ||
      message.includes("element not found") ||
      message.includes("credential not found") ||
      message.includes("os error 1168")
  }

  function stateDbPath(ctx) {
    if (ctx.app.platform === "windows") {
      return "~/AppData/Roaming/Cursor/User/globalStorage/state.vscdb"
    }
    if (ctx.app.platform === "linux") {
      return "~/.config/Cursor/User/globalStorage/state.vscdb"
    }
    return "~/Library/Application Support/Cursor/User/globalStorage/state.vscdb"
  }

  function readStateValue(ctx, key) {
    try {
      const sql =
        "SELECT value FROM ItemTable WHERE key = '" + key + "' LIMIT 1;"
      const json = ctx.host.sqlite.query(stateDbPath(ctx), sql)
      const rows = ctx.util.tryParseJson(json)
      if (!Array.isArray(rows)) {
        throw new Error("sqlite returned invalid json")
      }
      if (rows.length > 0 && rows[0].value) {
        return { value: rows[0].value, error: null }
      }
    } catch (e) {
      ctx.host.log.warn("sqlite read failed for " + key + ": " + String(e))
      return { value: null, error: String(e) }
    }
    return { value: null, error: null }
  }

  function writeStateValue(ctx, key, value) {
    try {
      // Escape single quotes in value for SQL
      const escaped = String(value).replace(/'/g, "''")
      const sql =
        "INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('" +
        key +
        "', '" +
        escaped +
        "');"
      ctx.host.sqlite.exec(stateDbPath(ctx), sql)
      return true
    } catch (e) {
      ctx.host.log.warn("sqlite write failed for " + key + ": " + String(e))
      return false
    }
  }

  function readKeychainValue(ctx, service) {
    if (!ctx.host.keychain || typeof ctx.host.keychain.readGenericPassword !== "function") {
      return { value: null, error: null }
    }
    try {
      const value = ctx.host.keychain.readGenericPassword(service)
      if (typeof value !== "string") return { value: null, error: null }
      const trimmed = value.trim()
      return { value: trimmed || null, error: null }
    } catch (e) {
      ctx.host.log.info("keychain read failed for " + service + ": " + String(e))
      if (isMissingCredentialError(e)) return { value: null, error: null }
      return { value: null, error: String(e) }
    }
  }

  function writeKeychainValue(ctx, service, value) {
    if (!ctx.host.keychain || typeof ctx.host.keychain.writeGenericPassword !== "function") {
      ctx.host.log.warn("keychain write unsupported")
      return false
    }
    try {
      ctx.host.keychain.writeGenericPassword(service, String(value))
      return true
    } catch (e) {
      ctx.host.log.warn("keychain write failed for " + service + ": " + String(e))
      return false
    }
  }

  function loadAuthState(ctx) {
    const sqliteAccess = readStateValue(ctx, "cursorAuth/accessToken")
    const sqliteRefresh = readStateValue(ctx, "cursorAuth/refreshToken")
    if (sqliteAccess.value || sqliteRefresh.value) {
      return {
        accessToken: sqliteAccess.value,
        refreshToken: sqliteRefresh.value,
        source: "sqlite",
        readErrors: [sqliteAccess.error, sqliteRefresh.error].filter(Boolean),
      }
    }

    const keychainAccess = readKeychainValue(ctx, KEYCHAIN_ACCESS_TOKEN_SERVICE)
    const keychainRefresh = readKeychainValue(ctx, KEYCHAIN_REFRESH_TOKEN_SERVICE)
    if (keychainAccess.value || keychainRefresh.value) {
      return {
        accessToken: keychainAccess.value,
        refreshToken: keychainRefresh.value,
        source: "keychain",
        readErrors: [keychainAccess.error, keychainRefresh.error].filter(Boolean),
      }
    }

    const sourceErrors = [
      sqliteAccess.error,
      sqliteRefresh.error,
      keychainAccess.error,
      keychainRefresh.error,
    ].filter(Boolean)
    if (sourceErrors.length > 0) {
      ctx.host.log.error("all Cursor credential sources failed: " + sourceErrors.join("; "))
      throw probeError(
        "credentialUnavailable",
        "Cursor auth state could not be read. Check system credential and Cursor database access."
      )
    }

    return {
      accessToken: null,
      refreshToken: null,
      source: null,
      readErrors: [],
    }
  }

  function detectSetup(ctx) {
    const dbPath = stateDbPath(ctx)
    let sqliteState = "missing"
    if (ctx.host.fs && ctx.host.fs.exists(dbPath)) {
      const access = readStateValue(ctx, "cursorAuth/accessToken")
      const refresh = readStateValue(ctx, "cursorAuth/refreshToken")
      if (access.value || refresh.value) sqliteState = "found"
      else if (access.error || refresh.error) sqliteState = "unavailable"
    }

    const keychain = readKeychainValue(ctx, KEYCHAIN_ACCESS_TOKEN_SERVICE)
    const keychainRefresh = readKeychainValue(ctx, KEYCHAIN_REFRESH_TOKEN_SERVICE)
    const keychainState =
      keychain.value || keychainRefresh.value
        ? "found"
        : keychain.error || keychainRefresh.error
          ? "unavailable"
          : "missing"

    return [
      { id: "cursor-sqlite", state: sqliteState },
      { id: "cursor-keychain", state: keychainState },
    ]
  }

  function persistAccessToken(ctx, source, accessToken) {
    if (source === "keychain") {
      return writeKeychainValue(ctx, KEYCHAIN_ACCESS_TOKEN_SERVICE, accessToken)
    }
    return writeStateValue(ctx, "cursorAuth/accessToken", accessToken)
  }

  function getTokenExpiration(ctx, token) {
    const payload = ctx.jwt.decodePayload(token)
    if (!payload || typeof payload.exp !== "number") return null
    return payload.exp * 1000 // Convert to milliseconds
  }

  function needsRefresh(ctx, accessToken, nowMs) {
    if (!accessToken) return true
    const expiresAt = getTokenExpiration(ctx, accessToken)
    return ctx.util.needsRefreshByExpiry({
      nowMs,
      expiresAtMs: expiresAt,
      bufferMs: REFRESH_BUFFER_MS,
    })
  }

  function refreshToken(ctx, refreshTokenValue, source) {
    if (!refreshTokenValue) {
      ctx.host.log.warn("refresh skipped: no refresh token")
      return null
    }

    ctx.host.log.info("attempting token refresh")
    try {
      const resp = ctx.util.request({
        method: "POST",
        url: REFRESH_URL,
        headers: { "Content-Type": "application/json" },
        bodyText: JSON.stringify({
          grant_type: "refresh_token",
          client_id: CLIENT_ID,
          refresh_token: refreshTokenValue,
        }),
        timeoutMs: 15000,
      })

      if (resp.status === 400 || resp.status === 401) {
        let errorInfo = null
        errorInfo = ctx.util.tryParseJson(resp.bodyText)
        const shouldLogout = errorInfo && errorInfo.shouldLogout === true
        ctx.host.log.error("refresh failed: status=" + resp.status + " shouldLogout=" + shouldLogout)
        if (shouldLogout) {
          throw probeError("credentialExpired", "Session expired. " + LOGIN_HINT)
        }
        throw probeError("credentialExpired", "Token expired. " + LOGIN_HINT)
      }

      if (resp.status < 200 || resp.status >= 300) {
        ctx.host.log.warn("refresh returned unexpected status: " + resp.status)
        return null
      }

      const body = ctx.util.tryParseJson(resp.bodyText)
      if (!body) {
        ctx.host.log.warn("refresh response not valid JSON")
        return null
      }

      // Check if server wants us to logout
      if (body.shouldLogout === true) {
        ctx.host.log.error("refresh response indicates shouldLogout=true")
        throw probeError("credentialExpired", "Session expired. " + LOGIN_HINT)
      }

      const newAccessToken = body.access_token
      if (!newAccessToken) {
        ctx.host.log.warn("refresh response missing access_token")
        return null
      }

      // Persist updated access token to source where auth was loaded from.
      persistAccessToken(ctx, source, newAccessToken)
      ctx.host.log.info("refresh succeeded, token persisted")

      // Note: Cursor refresh returns access_token which is used as both
      // access and refresh token in some flows
      return newAccessToken
    } catch (e) {
      if (typeof e === "string" || isProbeError(e)) throw e
      ctx.host.log.error("refresh exception: " + String(e))
      return null
    }
  }

  function connectPost(ctx, url, token) {
    return ctx.util.request({
      method: "POST",
      url: url,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
      },
      bodyText: "{}",
      timeoutMs: 10000,
    })
  }

  function buildSessionToken(ctx, accessToken) {
    var payload = ctx.jwt.decodePayload(accessToken)
    if (!payload || !payload.sub) return null
    var parts = String(payload.sub).split("|")
    var userId = parts.length > 1 ? parts[1] : parts[0]
    if (!userId) return null
    return { userId: userId, sessionToken: userId + "%3A%3A" + accessToken }
  }

  function fetchRequestBasedUsage(ctx, accessToken) {
    var session = buildSessionToken(ctx, accessToken)
    if (!session) {
      ctx.host.log.warn("request-based: cannot build session token")
      return null
    }
    try {
      var resp = ctx.util.request({
        method: "GET",
        url: REST_USAGE_URL + "?user=" + encodeURIComponent(session.userId),
        headers: {
          Cookie: "WorkosCursorSessionToken=" + session.sessionToken,
        },
        timeoutMs: 10000,
      })
      if (resp.status < 200 || resp.status >= 300) {
        ctx.host.log.warn("request-based usage returned status=" + resp.status)
        return null
      }
      return ctx.util.tryParseJson(resp.bodyText)
    } catch (e) {
      ctx.host.log.warn("request-based usage fetch failed: " + String(e))
      return null
    }
  }

  function fetchUsageSummary(ctx, accessToken) {
    var session = buildSessionToken(ctx, accessToken)
    if (!session) {
      ctx.host.log.warn("usage-summary: cannot build session token")
      return null
    }
    try {
      var resp = ctx.util.request({
        method: "GET",
        url: USAGE_SUMMARY_URL,
        headers: {
          Cookie: "WorkosCursorSessionToken=" + session.sessionToken,
        },
        timeoutMs: 10000,
      })
      if (resp.status < 200 || resp.status >= 300) {
        ctx.host.log.warn("usage-summary returned status=" + resp.status)
        return null
      }
      return ctx.util.tryParseJson(resp.bodyText)
    } catch (e) {
      ctx.host.log.warn("usage-summary fetch failed: " + String(e))
      return null
    }
  }

  function usageSummaryMeter(value) {
    if (!value || value.enabled === false) return null
    var limit = Number(value.limit)
    if (!Number.isFinite(limit) || limit <= 0) return null
    var used = Number(value.used)
    if (!Number.isFinite(used)) {
      var remaining = Number(value.remaining)
      if (!Number.isFinite(remaining)) return null
      used = limit - remaining
    }
    return { used: Math.max(0, used), limit: limit }
  }

  function buildUsageSummaryResult(ctx, accessToken, planName) {
    var summary = fetchUsageSummary(ctx, accessToken)
    if (!summary) return null

    var teamUsage = summary.teamUsage || {}
    var individualUsage = summary.individualUsage || {}
    var pooled = usageSummaryMeter(teamUsage.pooled)
    var individual = usageSummaryMeter(individualUsage.overall)
    var total = String(summary.limitType || "").toLowerCase() === "team"
      ? pooled
      : individual || pooled
    var onDemand = usageSummaryMeter(teamUsage.onDemand)
    var lines = []
    var startMs = ctx.util.parseDateMs(summary.billingCycleStart)
    var endMs = ctx.util.parseDateMs(summary.billingCycleEnd)
    var durationMs = startMs && endMs && endMs > startMs ? endMs - startMs : null

    if (total) {
      lines.push(ctx.line.progress({
        label: "Total usage",
        used: ctx.fmt.dollars(total.used),
        limit: ctx.fmt.dollars(total.limit),
        format: { kind: "dollars" },
        resetsAt: ctx.util.toIso(endMs),
        periodDurationMs: durationMs,
      }))
    }
    if (onDemand) {
      lines.push(ctx.line.progress({
        label: "On-demand",
        used: ctx.fmt.dollars(onDemand.used),
        limit: ctx.fmt.dollars(onDemand.limit),
        format: { kind: "dollars" },
      }))
    }
    if (lines.length === 0) return null

    var rawPlan = planName || summary.membershipType
    var plan = rawPlan ? ctx.fmt.planLabel(rawPlan) : null
    return { plan: plan || null, lines: lines }
  }

  function fetchStripeBalance(ctx, accessToken) {
    var session = buildSessionToken(ctx, accessToken)
    if (!session) {
      ctx.host.log.warn("stripe: cannot build session token")
      return null
    }
    try {
      var resp = ctx.util.request({
        method: "GET",
        url: STRIPE_URL,
        headers: {
          Cookie: "WorkosCursorSessionToken=" + session.sessionToken,
        },
        timeoutMs: 10000,
      })
      if (resp.status < 200 || resp.status >= 300) {
        ctx.host.log.warn("stripe balance returned status=" + resp.status)
        return null
      }
      var stripe = ctx.util.tryParseJson(resp.bodyText)
      if (!stripe) return null
      var customerBalanceCents = Number(stripe.customerBalance)
      if (!Number.isFinite(customerBalanceCents)) return null
      // Stripe stores customer credits as a negative balance.
      return customerBalanceCents < 0 ? Math.abs(customerBalanceCents) : 0
    } catch (e) {
      ctx.host.log.warn("stripe balance fetch failed: " + String(e))
      return null
    }
  }

  function formatDollarsText(ctx, cents) {
    return "$" + Number(ctx.fmt.dollars(cents)).toFixed(2)
  }

  function buildRequestBasedResult(ctx, accessToken, planName, unavailableMessage) {
    var requestUsage = fetchRequestBasedUsage(ctx, accessToken)
    var lines = []

    if (requestUsage) {
      var gpt4 = requestUsage["gpt-4"]
      if (gpt4 && typeof gpt4.maxRequestUsage === "number" && gpt4.maxRequestUsage > 0) {
        var used = gpt4.numRequests || 0
        var limit = gpt4.maxRequestUsage

        var billingPeriodMs = 30 * 24 * 60 * 60 * 1000
        var cycleStart = requestUsage.startOfMonth
          ? ctx.util.parseDateMs(requestUsage.startOfMonth)
          : null
        var cycleEndMs = cycleStart ? cycleStart + billingPeriodMs : null

        lines.push(ctx.line.progress({
          label: "Requests",
          used: used,
          limit: limit,
          format: { kind: "count", suffix: "requests" },
          resetsAt: ctx.util.toIso(cycleEndMs),
          periodDurationMs: billingPeriodMs,
        }))
      }
    }

    if (lines.length === 0) {
      ctx.host.log.warn("request-based: no usage data available")
      throw unavailableMessage
    }

    var plan = null
    if (planName) {
      var planLabel = ctx.fmt.planLabel(planName)
      if (planLabel) plan = planLabel
    }

    return { plan: plan, lines: lines }
  }

  function buildEnterpriseResult(ctx, accessToken, planName) {
    return buildRequestBasedResult(
      ctx,
      accessToken,
      planName,
      "Enterprise usage data unavailable. Try again later."
    )
  }

  function buildTeamRequestBasedResult(ctx, accessToken, planName) {
    return buildRequestBasedResult(
      ctx,
      accessToken,
      planName,
      "Team request-based usage data unavailable. Try again later."
    )
  }

  function buildUnknownRequestBasedResult(ctx, accessToken, planName) {
    return buildRequestBasedResult(
      ctx,
      accessToken,
      planName,
      "Cursor request-based usage data unavailable. Try again later."
    )
  }

  // ---------------------------------------------------------------------------
  // Usage event history
  //
  // Two cost values come from each event and keep separate meanings:
  // - `tokenUsage.totalCents` is the token cost at the model vendor's list price.
  //   It maps to history `costUsd`, the same meaning as the ccusage-based providers.
  // - `chargedCents` is the amount that Cursor deducted from the plan or charged.
  //   It maps to history `chargedCostUsd`.
  // The plugin never adds one to the other and never uses one in place of the other.
  // A bucket metric is set only when every event in the bucket reports a valid value.
  //
  // When history is omitted, the host keeps the last valid history as retained data.
  // So every doubtful result omits history instead of returning partial history.
  // ---------------------------------------------------------------------------

  function eventsFailure(reason, deferMs) {
    var failure = { ok: false, reason: reason }
    if (deferMs !== undefined) failure.deferMs = deferMs
    return failure
  }

  function nonNegativeNumber(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) && value >= 0 ? value : null
    }
    if (typeof value === "string" && value.trim() !== "") {
      var parsed = Number(value)
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
    }
    return null
  }

  function nonNegativeInteger(value) {
    var number = nonNegativeNumber(value)
    return number !== null && Number.isInteger(number) ? number : null
  }

  function stableStringify(value) {
    if (Array.isArray(value)) {
      return "[" + value.map(stableStringify).join(",") + "]"
    }
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + stableStringify(value[key])
      }).join(",") + "}"
    }
    return JSON.stringify(value === undefined ? null : value)
  }

  function parseUsageEventsPage(ctx, bodyText) {
    var body = ctx.util.tryParseJson(bodyText)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return eventsFailure("invalid JSON")
    }
    var keys = Object.keys(body)
    // An empty query returns an empty object. Any other shape must carry the event list,
    // so an error envelope cannot pass as confirmed empty usage.
    if (keys.length === 0) return { ok: true, total: 0, events: [] }

    var total = null
    if (Object.prototype.hasOwnProperty.call(body, "totalUsageEventsCount")) {
      total = nonNegativeInteger(body.totalUsageEventsCount)
      if (total === null) return eventsFailure("invalid totalUsageEventsCount")
    }
    if (!Object.prototype.hasOwnProperty.call(body, "usageEventsDisplay")) {
      if (total !== null && keys.length === 1) return { ok: true, total: total, events: [] }
      return eventsFailure("missing usageEventsDisplay")
    }
    if (!Array.isArray(body.usageEventsDisplay)) {
      return eventsFailure("usageEventsDisplay is not an array")
    }
    return { ok: true, total: total, events: body.usageEventsDisplay }
  }

  function headerValue(headers, name) {
    if (!headers || typeof headers !== "object") return null
    var keys = Object.keys(headers)
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase() === name) return String(headers[keys[i]])
    }
    return null
  }

  // Retry-After holds delay seconds or an HTTP date. Without a usable value,
  // wait one history refresh interval.
  function retryAfterDelayMs(headers, nowMs) {
    var value = headerValue(headers, "retry-after")
    var delayMs = null
    if (value !== null) {
      var trimmed = value.trim()
      if (/^\d+$/.test(trimmed)) {
        delayMs = Number(trimmed) * 1000
      } else {
        var dateMs = Date.parse(trimmed)
        if (Number.isFinite(dateMs)) delayMs = dateMs - nowMs
      }
    }
    if (delayMs === null) return USAGE_HISTORY_REFRESH_MS
    return Math.min(
      Math.max(delayMs, USAGE_HISTORY_MIN_RETRY_AFTER_MS),
      USAGE_HISTORY_MAX_RETRY_AFTER_MS
    )
  }

  function fetchUsageEventsPage(ctx, session, page, window, timeoutMs) {
    var resp
    try {
      resp = ctx.util.request({
        method: "POST",
        url: USAGE_EVENTS_URL,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          // Cursor checks the Origin header on dashboard POST requests (CSRF guard).
          Origin: USAGE_EVENTS_ORIGIN,
          Cookie: "WorkosCursorSessionToken=" + session.sessionToken,
        },
        bodyText: JSON.stringify({
          page: page,
          pageSize: USAGE_EVENTS_PAGE_SIZE,
          startDate: String(window.startMs),
          endDate: String(window.endMs),
        }),
        timeoutMs: timeoutMs,
      })
    } catch (e) {
      return eventsFailure("request failed: " + String(e))
    }
    if (resp.status === 429) {
      return eventsFailure("HTTP 429", retryAfterDelayMs(resp.headers, Date.now()))
    }
    if (resp.status < 200 || resp.status >= 300) {
      return eventsFailure("HTTP " + String(resp.status))
    }
    return parseUsageEventsPage(ctx, resp.bodyText)
  }

  // Every length k > 0 for which the last k rows of `previous` equal the first k rows of `current`.
  function boundaryOverlaps(previous, current) {
    var overlaps = []
    var limit = Math.min(previous.length, current.length)
    for (var count = 1; count <= limit; count++) {
      var matches = true
      for (var i = 0; i < count; i++) {
        if (previous[previous.length - count + i] !== current[i]) {
          matches = false
          break
        }
      }
      if (matches) overlaps.push(count)
    }
    return overlaps
  }

  // The endpoint has no stable event ID, and two real events can be identical.
  // The reported total proves how many rows repeat, but not which rows. Rows are
  // removed only when the repeats at page boundaries explain the excess exactly,
  // with one possible overlap per boundary. Any other case omits history, because
  // a guess could drop the wrong row and move usage to the wrong model.
  function reconcilePages(pages, expectedTotal) {
    var rawCount = pages.reduce(function (sum, page) { return sum + page.length }, 0)
    if (rawCount < expectedTotal) {
      return eventsFailure("incomplete pages: expected " + expectedTotal + ", received " + rawCount)
    }
    var excess = rawCount - expectedTotal
    var removals = pages.map(function () { return 0 })
    if (excess > 0) {
      var keys = pages.map(function (page) { return page.map(stableStringify) })
      var removable = 0
      for (var p = 1; p < pages.length; p++) {
        var overlaps = boundaryOverlaps(keys[p - 1], keys[p])
        if (overlaps.length > 1) return eventsFailure("ambiguous overlap at page " + (p + 1))
        removals[p] = overlaps.length === 1 ? overlaps[0] : 0
        removable += removals[p]
      }
      if (removable !== excess) {
        return eventsFailure(
          "page overlap does not match total: " + excess + " extra rows, " + removable + " repeated"
        )
      }
    }
    var events = []
    for (var i = 0; i < pages.length; i++) {
      events = events.concat(pages[i].slice(removals[i]))
    }
    return { ok: true, events: events }
  }

  function fetchUsageEvents(ctx, session, window, deadlineMs) {
    var pages = []
    var expectedTotal = null
    var completed = false
    for (var page = 1; page <= USAGE_EVENTS_MAX_PAGES; page++) {
      var remainingMs = deadlineMs - Date.now()
      if (remainingMs < USAGE_HISTORY_MIN_PAGE_MS) {
        return eventsFailure("time budget exhausted before page " + page, USAGE_HISTORY_REFRESH_MS)
      }
      var result = fetchUsageEventsPage(
        ctx,
        session,
        page,
        window,
        Math.min(USAGE_EVENTS_PAGE_TIMEOUT_MS, remainingMs)
      )
      if (!result.ok) {
        // A request that used up the budget would fail the same way on the next probe.
        if (result.deferMs === undefined && deadlineMs - Date.now() < USAGE_HISTORY_MIN_PAGE_MS) {
          return eventsFailure("time budget exhausted (" + result.reason + ")", USAGE_HISTORY_REFRESH_MS)
        }
        return result
      }
      if (result.total !== null) {
        if (expectedTotal !== null && expectedTotal !== result.total) {
          return eventsFailure("total changed between pages")
        }
        expectedTotal = result.total
      }
      if (result.events.length === 0) {
        completed = true
        break
      }
      pages.push(result.events)
      if (result.events.length < USAGE_EVENTS_PAGE_SIZE) {
        completed = true
        break
      }
    }
    // A full last page at the cap does not prove that no more events exist.
    if (!completed) return eventsFailure("page limit reached", USAGE_HISTORY_REFRESH_MS)
    if (expectedTotal === null) {
      return { ok: true, events: pages.reduce(function (all, p) { return all.concat(p) }, []) }
    }
    return reconcilePages(pages, expectedTotal)
  }

  function historyWindow(nowMs) {
    var now = new Date(nowMs)
    // Calendar arithmetic keeps whole local days across daylight saving changes.
    var startMs = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - (USAGE_HISTORY_DAYS - 1)
    ).getTime()
    return { startMs: startMs, endMs: nowMs }
  }

  function localDayStartMs(ms) {
    var date = new Date(ms)
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  }

  function pad2(value) {
    return (value < 10 ? "0" : "") + value
  }

  // RFC 3339 with the local offset, so the date part is the local calendar day.
  function localRfc3339(date) {
    var offsetMinutes = -date.getTimezoneOffset()
    var absMinutes = Math.abs(offsetMinutes)
    return (
      date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate()) +
      "T" + pad2(date.getHours()) + ":" + pad2(date.getMinutes()) + ":" + pad2(date.getSeconds()) +
      (offsetMinutes < 0 ? "-" : "+") + pad2(Math.floor(absMinutes / 60)) + ":" + pad2(absMinutes % 60)
    )
  }

  function localDayPeriod(dayStartMs) {
    var start = new Date(dayStartMs)
    var end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
    return { periodStart: localRfc3339(start), periodEnd: localRfc3339(end) }
  }

  function readTokenCount(tokenUsage, field) {
    if (!tokenUsage) return null
    return nonNegativeNumber(tokenUsage[field])
  }

  // Returns null when the event cannot be assigned to a day of the requested window.
  function normalizeUsageEvent(raw, window) {
    if (!raw || typeof raw !== "object") return null
    var timestampMs = nonNegativeInteger(raw.timestamp)
    if (timestampMs === null || timestampMs < window.startMs || timestampMs > window.endMs) return null
    var tokenUsage = raw.tokenUsage && typeof raw.tokenUsage === "object" ? raw.tokenUsage : null
    var model = typeof raw.model === "string" ? raw.model.trim() : ""
    return {
      timestampMs: timestampMs,
      model: model || null,
      inputTokens: readTokenCount(tokenUsage, "inputTokens"),
      outputTokens: readTokenCount(tokenUsage, "outputTokens"),
      cacheReadTokens: readTokenCount(tokenUsage, "cacheReadTokens"),
      cacheCreationTokens: readTokenCount(tokenUsage, "cacheWriteTokens"),
      listPriceCents: readTokenCount(tokenUsage, "totalCents"),
      chargedCents: nonNegativeNumber(raw.chargedCents),
    }
  }

  var BUCKET_METRICS = [
    "inputTokens",
    "outputTokens",
    "cacheReadTokens",
    "cacheCreationTokens",
    "listPriceCents",
    "chargedCents",
  ]

  // A null sum means at least one event in the bucket did not report the metric.
  function addToBucket(bucket, event) {
    bucket.requests += 1
    for (var i = 0; i < BUCKET_METRICS.length; i++) {
      var metric = BUCKET_METRICS[i]
      var value = event[metric]
      bucket[metric] = bucket[metric] === null || value === null ? null : bucket[metric] + value
    }
  }

  function bucketEntry(bucket) {
    var entry = localDayPeriod(bucket.dayStartMs)
    if (bucket.model) entry.model = bucket.model
    entry.requests = bucket.requests
    if (bucket.inputTokens !== null) entry.inputTokens = bucket.inputTokens
    if (bucket.outputTokens !== null) entry.outputTokens = bucket.outputTokens
    if (bucket.cacheReadTokens !== null) entry.cacheReadTokens = bucket.cacheReadTokens
    if (bucket.cacheCreationTokens !== null) entry.cacheCreationTokens = bucket.cacheCreationTokens
    if (
      bucket.inputTokens !== null &&
      bucket.outputTokens !== null &&
      bucket.cacheReadTokens !== null &&
      bucket.cacheCreationTokens !== null
    ) {
      entry.totalTokens =
        bucket.inputTokens + bucket.outputTokens + bucket.cacheReadTokens + bucket.cacheCreationTokens
    }
    if (bucket.listPriceCents !== null) entry.costUsd = bucket.listPriceCents / 100
    if (bucket.chargedCents !== null) entry.chargedCostUsd = bucket.chargedCents / 100
    return entry
  }

  function buildUsageEventHistory(rawEvents, window) {
    var buckets = {}
    var order = []
    var unassigned = 0
    for (var i = 0; i < rawEvents.length; i++) {
      var event = normalizeUsageEvent(rawEvents[i], window)
      if (!event) {
        unassigned += 1
        continue
      }
      var dayStartMs = localDayStartMs(event.timestampMs)
      var key = dayStartMs + "\u0000" + (event.model || "")
      if (!buckets[key]) {
        buckets[key] = {
          dayStartMs: dayStartMs,
          model: event.model,
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          listPriceCents: 0,
          chargedCents: 0,
        }
        order.push(key)
      }
      addToBucket(buckets[key], event)
    }
    // Day totals without these events would be too low, so keep the last valid history.
    if (unassigned > 0) {
      return eventsFailure(unassigned + " events without a valid timestamp in the requested window")
    }
    order.sort(function (a, b) {
      var left = buckets[a]
      var right = buckets[b]
      if (left.dayStartMs !== right.dayStartMs) return left.dayStartMs - right.dayStartMs
      return String(left.model || "").localeCompare(String(right.model || ""))
    })
    return {
      ok: true,
      history: {
        version: 1,
        source: "cursor-usage-events",
        timeZone: "system-local",
        entries: order.map(function (key) { return bucketEntry(buckets[key]) }),
      },
    }
  }

  function historySchedulePath(ctx) {
    return ctx.app.pluginDataDir + "/" + USAGE_HISTORY_SCHEDULE_FILE
  }

  function readHistorySchedule(ctx) {
    try {
      var path = historySchedulePath(ctx)
      if (!ctx.host.fs.exists(path)) return null
      var data = ctx.util.tryParseJson(ctx.host.fs.readText(path))
      if (
        !data ||
        typeof data.userId !== "string" ||
        typeof data.nextFetchAtMs !== "number" ||
        !Number.isFinite(data.nextFetchAtMs)
      ) {
        return null
      }
      return data
    } catch (e) {
      ctx.host.log.warn("usage events: history schedule unreadable: " + String(e))
      return null
    }
  }

  function writeHistorySchedule(ctx, userId, nextFetchAtMs) {
    try {
      ctx.host.fs.writeText(
        historySchedulePath(ctx),
        JSON.stringify({ userId: userId, nextFetchAtMs: nextFetchAtMs })
      )
    } catch (e) {
      ctx.host.log.warn("usage events: history schedule not saved: " + String(e))
    }
  }

  function isHistoryFetchDeferred(schedule, userId, nowMs) {
    // A different account is always due. A date too far ahead (clock change) is ignored.
    return Boolean(
      schedule &&
      schedule.userId === userId &&
      schedule.nextFetchAtMs > nowMs &&
      schedule.nextFetchAtMs - nowMs <= USAGE_HISTORY_MAX_RETRY_AFTER_MS
    )
  }

  function refreshUsageEventHistory(ctx, accessToken, probeStartedAtMs) {
    var session = buildSessionToken(ctx, accessToken)
    if (!session) {
      ctx.host.log.warn("usage events: cannot build session token; history omitted")
      return undefined
    }
    var nowMs = Date.now()
    var schedule = readHistorySchedule(ctx)
    if (isHistoryFetchDeferred(schedule, session.userId, nowMs)) {
      ctx.host.log.info(
        "usage events: next history fetch at " + new Date(schedule.nextFetchAtMs).toISOString() +
        "; host keeps the last history"
      )
      return undefined
    }
    var window = historyWindow(nowMs)
    var fetched = fetchUsageEvents(ctx, session, window, probeStartedAtMs + USAGE_HISTORY_BUDGET_MS)
    var built = fetched.ok ? buildUsageEventHistory(fetched.events, window) : fetched
    if (!built.ok) {
      if (built.deferMs !== undefined) {
        writeHistorySchedule(ctx, session.userId, Date.now() + built.deferMs)
      }
      ctx.host.log.warn("usage events unavailable (" + built.reason + "); history omitted")
      return undefined
    }
    writeHistorySchedule(ctx, session.userId, Date.now() + USAGE_HISTORY_REFRESH_MS)
    return built.history
  }

  function probe(ctx) {
    const probeStartedAtMs = Date.now()
    const state = { accessToken: null }
    const result = probeSummary(ctx, state)
    const history = refreshUsageEventHistory(ctx, state.accessToken, probeStartedAtMs)
    if (history) result.history = history
    return result
  }

  function probeSummary(ctx, state) {
    const authState = loadAuthState(ctx)
    let accessToken = authState.accessToken
    const refreshTokenValue = authState.refreshToken
    const authSource = authState.source
    const credentialReadErrors = authState.readErrors || []

    if (!accessToken && !refreshTokenValue) {
      ctx.host.log.error("probe failed: no access or refresh token in sqlite/keychain")
      throw probeError("credentialMissing", "Not logged in. " + LOGIN_HINT)
    }

    ctx.host.log.info("tokens loaded from " + authSource + ": accessToken=" + (accessToken ? "yes" : "no") + " refreshToken=" + (refreshTokenValue ? "yes" : "no"))

    const nowMs = Date.now()

    // Proactively refresh if token is expired or about to expire
    if (needsRefresh(ctx, accessToken, nowMs)) {
      ctx.host.log.info("token needs refresh (expired or expiring soon)")
      if (!refreshTokenValue && credentialReadErrors.length > 0) {
        throw probeError(
          "credentialUnavailable",
          "Cursor refresh credentials could not be read. Check system credential and Cursor database access."
        )
      }
      let refreshed = null
      try {
        refreshed = refreshToken(ctx, refreshTokenValue, authSource)
      } catch (e) {
        // If refresh fails but we have an access token, try it anyway
        ctx.host.log.warn("refresh failed but have access token, will try: " + String(e))
        if (!accessToken) throw e
      }
      if (refreshed) {
        accessToken = refreshed
      } else if (!accessToken) {
        ctx.host.log.error("refresh failed and no access token available")
        throw probeError("credentialMissing", "Not logged in. " + LOGIN_HINT)
      }
    }

    let usageResp
    let didRefresh = false
    try {
      usageResp = ctx.util.retryOnceOnAuth({
        request: (token) => {
          try {
            return connectPost(ctx, USAGE_URL, token || accessToken)
          } catch (e) {
            ctx.host.log.error("usage request exception: " + String(e))
            if (didRefresh) {
              throw "Usage request failed after refresh. Try again."
            }
            throw "Usage request failed. Check your connection."
          }
        },
        refresh: () => {
          ctx.host.log.info("usage returned 401, attempting refresh")
          didRefresh = true
          const refreshed = refreshToken(ctx, refreshTokenValue, authSource)
          if (refreshed) accessToken = refreshed
          return refreshed
        },
      })
    } catch (e) {
      if (typeof e === "string" || isProbeError(e)) throw e
      ctx.host.log.error("usage request failed: " + String(e))
      throw "Usage request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(usageResp.status)) {
      ctx.host.log.error("usage returned auth error after all retries: status=" + usageResp.status)
      throw probeError("credentialExpired", "Token expired. " + LOGIN_HINT)
    }

    if (usageResp.status < 200 || usageResp.status >= 300) {
      ctx.host.log.error("usage returned error: status=" + usageResp.status)
      throw "Usage request failed (HTTP " + String(usageResp.status) + "). Try again later."
    }

    ctx.host.log.info("usage fetch succeeded")
    state.accessToken = accessToken

    const usage = ctx.util.tryParseJson(usageResp.bodyText)
    if (usage === null) {
      throw "Usage response invalid. Try again later."
    }

    // Fetch plan info early (needed for request-based fallback detection)
    let planName = ""
    let planInfo = null
    let planInfoUnavailable = false
    try {
      const planResp = connectPost(ctx, PLAN_URL, accessToken)
      if (planResp.status >= 200 && planResp.status < 300) {
        const plan = ctx.util.tryParseJson(planResp.bodyText)
        if (plan && plan.planInfo) {
          planInfo = plan.planInfo
          if (plan.planInfo.planName) {
            planName = plan.planInfo.planName
          }
        }
      } else {
        planInfoUnavailable = true
        ctx.host.log.warn("plan info returned error: status=" + planResp.status)
      }
    } catch (e) {
      planInfoUnavailable = true
      ctx.host.log.warn("plan info fetch failed: " + String(e))
    }

    const normalizedPlanName = typeof planName === "string"
      ? planName.toLowerCase()
      : ""

    // Enterprise and some Team request-based accounts return no planUsage from
    // the Connect API. Detect them and use the REST usage API instead.
    const needsRequestBasedFallback = !usage.planUsage && (
      normalizedPlanName === "enterprise" ||
      normalizedPlanName === "team"
    )
    if (needsRequestBasedFallback) {
      const summaryResult = buildUsageSummaryResult(ctx, accessToken, planName)
      if (summaryResult) {
        ctx.host.log.info("detected " + normalizedPlanName + " account, using usage-summary API")
        return summaryResult
      }
      if (normalizedPlanName === "enterprise") {
        ctx.host.log.info("detected enterprise account, using REST usage API")
        return buildEnterpriseResult(ctx, accessToken, planName)
      }
      ctx.host.log.info("detected team request-based account, using REST usage API")
      return buildTeamRequestBasedResult(ctx, accessToken, planName)
    }

    const needsFallbackWithoutPlanInfo = usage.enabled !== false &&
      !usage.planUsage &&
      !normalizedPlanName &&
      planInfoUnavailable
    if (needsFallbackWithoutPlanInfo) {
      ctx.host.log.info("plan info unavailable with missing planUsage, attempting REST usage API fallback")
      return buildUnknownRequestBasedResult(ctx, accessToken, planName)
    }

    // Team plans may omit `enabled` even with valid plan usage data.
    if (usage.enabled === false || !usage.planUsage) {
      ctx.host.log.info("usage lacks planUsage or is disabled, attempting REST usage API fallback")
      try {
        return buildUnknownRequestBasedResult(ctx, accessToken, planName)
      } catch (fallbackError) {
        ctx.host.log.warn("request-based fallback unavailable: " + String(fallbackError))
      }
      throw "No active Cursor subscription."
    }

    let creditGrants = null
    try {
      const creditsResp = connectPost(ctx, CREDITS_URL, accessToken)
      if (creditsResp.status >= 200 && creditsResp.status < 300) {
        creditGrants = ctx.util.tryParseJson(creditsResp.bodyText)
      }
    } catch (e) {
      ctx.host.log.warn("credit grants fetch failed: " + String(e))
    }

    const stripeBalanceCents = fetchStripeBalance(ctx, accessToken) || 0

    let plan = null
    if (planName) {
      const planLabel = ctx.fmt.planLabel(planName)
      if (planLabel) {
        plan = planLabel
      }
    }

    const lines = []
    const pu = usage.planUsage

    // Credits first (if available) - highest priority primary metric
    const hasCreditGrants = creditGrants && creditGrants.hasCreditGrants === true
    const grantTotalCents = hasCreditGrants ? parseInt(creditGrants.totalCents, 10) : 0
    const grantUsedCents = hasCreditGrants ? parseInt(creditGrants.usedCents, 10) : 0
    const hasValidGrantData = hasCreditGrants &&
      grantTotalCents > 0 &&
      !isNaN(grantTotalCents) &&
      !isNaN(grantUsedCents)
    const combinedTotalCents = (hasValidGrantData ? grantTotalCents : 0) + stripeBalanceCents

    if (combinedTotalCents > 0) {
      lines.push(ctx.line.progress({
        label: "Credits",
        used: ctx.fmt.dollars(hasValidGrantData ? grantUsedCents : 0),
        limit: ctx.fmt.dollars(combinedTotalCents),
        format: { kind: "dollars" },
      }))
    }

    const su = usage.spendLimitUsage
    const isTeamAccount = (
      normalizedPlanName === "team" ||
      (su && su.limitType === "team") ||
      (su && typeof su.pooledLimit === "number" && su.pooledLimit > 0)
    )
    const hasFiniteLimit = typeof pu.limit === "number" && Number.isFinite(pu.limit)
    const hasFinitePercent = Number.isFinite(pu.totalPercentUsed)

    // Free/individual plans can be percent-only; team rendering still needs dollars.
    if (isTeamAccount && !hasFiniteLimit) {
      throw "Total usage limit missing from API response."
    }
    if (!isTeamAccount && !hasFiniteLimit && !hasFinitePercent) {
      throw "Total usage limit missing from API response."
    }

    const planUsed = hasFiniteLimit
      ? (typeof pu.totalSpend === "number" ? pu.totalSpend : pu.limit - (pu.remaining ?? 0))
      : null
    const computedPercentUsed = hasFiniteLimit
      ? (pu.limit > 0 ? (planUsed / pu.limit) * 100 : 0)
      : null
    const totalUsagePercent = hasFinitePercent
      ? pu.totalPercentUsed
      : computedPercentUsed

    if (!isTeamAccount && !hasFiniteLimit && hasFinitePercent) {
      ctx.host.log.info("total usage limit missing; using totalPercentUsed for individual account")
    }

    // Calculate billing cycle period duration
    var billingPeriodMs = 30 * 24 * 60 * 60 * 1000 // 30 days default
    var cycleStart = Number(usage.billingCycleStart)
    var cycleEnd = Number(usage.billingCycleEnd)
    if (Number.isFinite(cycleStart) && Number.isFinite(cycleEnd) && cycleEnd > cycleStart) {
      billingPeriodMs = cycleEnd - cycleStart // already in ms
    }

    if (isTeamAccount) {
      lines.push(ctx.line.progress({
        label: "Total usage",
        used: ctx.fmt.dollars(planUsed),
        limit: ctx.fmt.dollars(pu.limit),
        format: { kind: "dollars" },
        resetsAt: ctx.util.toIso(usage.billingCycleEnd),
        periodDurationMs: billingPeriodMs
      }))

      if (typeof pu.bonusSpend === "number" && pu.bonusSpend > 0) {
        lines.push(ctx.line.text({ label: "Bonus spend", value: "$" + String(ctx.fmt.dollars(pu.bonusSpend)) }))
      }
    } else {
      lines.push(ctx.line.progress({
        label: "Total usage",
        used: totalUsagePercent,
        limit: 100,
        format: { kind: "percent" },
        resetsAt: ctx.util.toIso(usage.billingCycleEnd),
        periodDurationMs: billingPeriodMs
      }))
    }

    if (hasFiniteLimit && planUsed !== null) {
      lines.push(ctx.line.text({
        label: "Included budget",
        value: formatDollarsText(ctx, planUsed) + " / " + formatDollarsText(ctx, pu.limit),
      }))
    } else if (planInfo && typeof planInfo.includedAmountCents === "number" && Number.isFinite(planInfo.includedAmountCents)) {
      lines.push(ctx.line.text({
        label: "Included budget",
        value: "$0.00 / " + formatDollarsText(ctx, planInfo.includedAmountCents),
      }))
    }

    if (typeof pu.autoPercentUsed === "number" && Number.isFinite(pu.autoPercentUsed)) {
      lines.push(ctx.line.progress({
        label: "Auto usage",
        used: pu.autoPercentUsed,
        limit: 100,
        format: { kind: "percent" },
        resetsAt: ctx.util.toIso(usage.billingCycleEnd),
        periodDurationMs: billingPeriodMs
      }))
    }

    if (typeof pu.apiPercentUsed === "number" && Number.isFinite(pu.apiPercentUsed)) {
      lines.push(ctx.line.progress({
        label: "API usage",
        used: pu.apiPercentUsed,
        limit: 100,
        format: { kind: "percent" },
        resetsAt: ctx.util.toIso(usage.billingCycleEnd),
        periodDurationMs: billingPeriodMs
      }))
    }

    // On-demand (if available) - not a primary candidate
    if (su) {
      const limit = su.individualLimit ?? su.pooledLimit ?? 0
      const remaining = su.individualRemaining ?? su.pooledRemaining ?? 0
      lines.push(ctx.line.text({
        label: "On-demand status",
        value: limit > 0 ? "Enabled" : "Disabled",
      }))
      if (limit > 0) {
        const used = limit - remaining
        lines.push(ctx.line.progress({
          label: "On-demand",
          used: ctx.fmt.dollars(used),
          limit: ctx.fmt.dollars(limit),
          format: { kind: "dollars" },
        }))
      }
    }

    return { plan: plan, lines: lines }
  }

  globalThis.__openusage_plugin = { id: "cursor", probe, detectSetup }
})()
