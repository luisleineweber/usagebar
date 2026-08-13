;(function () {
  const PROVIDER_ID = "opencode-go"
  const BASE_URL = "https://opencode.ai"
  const GO_USAGE_URL = BASE_URL + "/zen/go/v1/usage"
  const SERVER_URL = BASE_URL + "/_server"
  const WORKSPACES_SERVER_ID = "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f"
  const SUBSCRIPTION_SERVER_ID = "7abeebee372f304e050aaaf92be863f4a86490e382f8c79db68fd94040d691b4"
  const COOKIE_HEADER_SERVICE = "OpenCode Cookie Header"
  const AUTH_PATH = "~/.local/share/opencode/auth.json"
  const DB_PATH = "~/.local/share/opencode/opencode.db"
  const AUTH_ENTRY_KEYS = ["opencode-go", "opencode"]
  const HISTORY_PROVIDER_IDS = ["opencode-go", "opencode"]
  const HISTORY_PROVIDER_SQL = HISTORY_PROVIDER_IDS.map(
    (providerId) => "'" + providerId.replace(/'/g, "''") + "'"
  ).join(", ")
  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000
  const MONTH_MS = 30 * 24 * 60 * 60 * 1000
  const FREE_LIMITS = {
    sessionRequests: 200,
  }
  const PLAN = {
    go: "GoSubscription",
    free: "Free",
  }

  const HISTORY_EXISTS_SQL = `
    SELECT 1 AS present
    FROM message
    WHERE json_valid(data)
      AND json_extract(data, '$.providerID') IN (${HISTORY_PROVIDER_SQL})
      AND json_extract(data, '$.role') = 'assistant'
      AND json_type(data, '$.cost') IN ('integer', 'real')
    LIMIT 1
  `

  const HISTORY_ROWS_SQL = `
    SELECT
      CAST(COALESCE(json_extract(data, '$.time.created'), time_created) AS INTEGER) AS createdMs,
      json_extract(data, '$.modelID') AS modelId,
      CAST(json_extract(data, '$.cost') AS REAL) AS cost
    FROM message
    WHERE json_valid(data)
      AND json_extract(data, '$.providerID') IN (${HISTORY_PROVIDER_SQL})
      AND json_extract(data, '$.role') = 'assistant'
      AND json_type(data, '$.cost') IN ('integer', 'real')
  `

  function readNumber(value) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  function readNowMs() {
    return Date.now()
  }

  function randomInstanceId() {
    return "server-fn:" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2)
  }

  function readEnv(ctx, name) {
    if (!ctx.host.env || typeof ctx.host.env.get !== "function") return null
    try {
      const value = ctx.host.env.get(name)
      if (typeof value !== "string") return null
      return value.trim() || null
    } catch {
      return null
    }
  }

  function readProviderConfig(ctx, key) {
    if (!ctx.host.providerConfig || typeof ctx.host.providerConfig.get !== "function") return null
    try {
      const value = ctx.host.providerConfig.get(key)
      if (typeof value !== "string") return null
      return value.trim() || null
    } catch {
      return null
    }
  }

  function readProviderSecret(ctx, key) {
    if (!ctx.host.providerSecrets || typeof ctx.host.providerSecrets.read !== "function")
      return null
    try {
      const value = ctx.host.providerSecrets.read(key)
      if (typeof value !== "string") return null
      return value.trim() || null
    } catch {
      return null
    }
  }

  function readZenCookieHeader(ctx) {
    const source = readProviderConfig(ctx, "source") || "manual"
    if (source === "auto") return null

    const providerSecret = readProviderSecret(ctx, "cookieHeader")
    if (providerSecret) return { value: providerSecret, source: "Stored Cookie header" }

    const envValue = readEnv(ctx, "OPENCODE_COOKIE_HEADER")
    if (envValue) return { value: envValue, source: "OPENCODE_COOKIE_HEADER" }

    if (ctx.host.keychain && typeof ctx.host.keychain.readGenericPassword === "function") {
      try {
        const stored = ctx.host.keychain.readGenericPassword(COOKIE_HEADER_SERVICE)
        if (typeof stored === "string" && stored.trim()) {
          return { value: stored.trim(), source: "Legacy keychain Cookie header" }
        }
      } catch {
        // Ignore an unavailable legacy keychain entry and continue with other credentials.
      }
    }
    return null
  }

  function normalizeWorkspaceId(raw) {
    if (typeof raw !== "string") return null
    const trimmed = raw.trim()
    if (!trimmed) return null
    if (/^wrk_[A-Za-z0-9]+$/.test(trimmed)) return trimmed
    const direct = trimmed.match(/wrk_[A-Za-z0-9]+/)
    return direct ? direct[0] : null
  }

  function requestServer(ctx, opts) {
    const request = {
      method: opts.method,
      url:
        opts.method === "GET"
          ? SERVER_URL +
            "?id=" +
            encodeURIComponent(opts.serverId) +
            (opts.args && opts.args.length
              ? "&args=" + encodeURIComponent(JSON.stringify(opts.args))
              : "")
          : SERVER_URL,
      headers: {
        Accept: "text/javascript, application/json;q=0.9, */*;q=0.8",
        Cookie: opts.cookieHeader,
        Origin: BASE_URL,
        Referer: opts.referer,
        "User-Agent": "OpenUsage/OpenCode",
        "X-Server-Id": opts.serverId,
        "X-Server-Instance": randomInstanceId(),
      },
      timeoutMs: 15000,
    }
    if (opts.method !== "GET") {
      request.headers["Content-Type"] = "application/json"
      request.bodyText = JSON.stringify(opts.args || [])
    }
    const response = ctx.host.http.request(request)
    if (response.status === 401 || response.status === 403) {
      throw "OpenCode Zen session cookie is invalid or expired."
    }
    if (response.status < 200 || response.status >= 300) {
      throw "OpenCode Zen request failed (HTTP " + response.status + ")."
    }
    return response.bodyText
  }

  function requestBillingPage(ctx, opts) {
    const response = ctx.host.http.request({
      method: "GET",
      url: BASE_URL + "/workspace/" + opts.workspaceId + "/billing",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Cookie: opts.cookieHeader,
        Referer: BASE_URL + "/workspace/" + opts.workspaceId + "/billing",
        "User-Agent": "OpenUsage/OpenCode",
      },
      timeoutMs: 15000,
    })
    if (response.status === 401 || response.status === 403) {
      throw "OpenCode Zen session cookie is invalid or expired."
    }
    if (response.status < 200 || response.status >= 300) {
      throw "OpenCode Zen billing page request failed (HTTP " + response.status + ")."
    }
    return response.bodyText
  }

  function collectWorkspaceIds(value, out) {
    if (!value) return
    if (typeof value === "string") {
      const match = normalizeWorkspaceId(value)
      if (match && out.indexOf(match) === -1) out.push(match)
      return
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) collectWorkspaceIds(value[i], out)
      return
    }
    if (typeof value === "object") {
      const keys = Object.keys(value)
      for (let i = 0; i < keys.length; i += 1) collectWorkspaceIds(value[keys[i]], out)
    }
  }

  function parseWorkspaceIds(ctx, text) {
    const ids = []
    const regex = /id\s*:\s*"(wrk_[^"]+)"/g
    let match
    while ((match = regex.exec(text))) {
      if (ids.indexOf(match[1]) === -1) ids.push(match[1])
    }
    if (ids.length > 0) return ids
    const parsed = ctx.util.tryParseJson(text)
    if (parsed) collectWorkspaceIds(parsed, ids)
    return ids
  }

  function resolveWorkspaceId(ctx, cookieHeader) {
    const override =
      normalizeWorkspaceId(readEnv(ctx, "OPENCODE_WORKSPACE_ID")) ||
      normalizeWorkspaceId(readProviderConfig(ctx, "workspaceId"))
    if (override) return override

    const first = requestServer(ctx, {
      method: "GET",
      serverId: WORKSPACES_SERVER_ID,
      args: null,
      cookieHeader,
      referer: BASE_URL,
    })
    let ids = parseWorkspaceIds(ctx, first)
    if (ids.length > 0) return ids[0]

    const fallback = requestServer(ctx, {
      method: "POST",
      serverId: WORKSPACES_SERVER_ID,
      args: [],
      cookieHeader,
      referer: BASE_URL,
    })
    ids = parseWorkspaceIds(ctx, fallback)
    if (ids.length > 0) return ids[0]
    throw "OpenCode Zen workspace not found. Set OPENCODE_WORKSPACE_ID or Workspace ID."
  }

  function readCurrencyNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value !== "string") return null
    const cleaned = value.trim().replace(/[$,\s]/g, "")
    if (!cleaned) return null
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }

  function keyLooksLikeBalance(key) {
    const lower = String(key || "").toLowerCase()
    if (lower.indexOf("balance") !== -1) return true
    if (lower.indexOf("credit") !== -1 && lower.indexOf("card") === -1) return true
    if (lower.indexOf("guthaben") !== -1) return true
    return false
  }

  function normalizeBalanceFromKey(key, value) {
    const number = readCurrencyNumber(value)
    if (number === null) return null
    const lower = String(key || "").toLowerCase()
    if (
      lower.indexOf("cent") !== -1 ||
      lower.indexOf("cents") !== -1 ||
      lower.indexOf("minor") !== -1
    ) {
      return number / 100
    }
    return number
  }

  function findBalanceValue(value, path, depth) {
    if (depth > 6 || value === null || value === undefined) return null

    if (typeof value !== "object") {
      return keyLooksLikeBalance(path[path.length - 1])
        ? normalizeBalanceFromKey(path[path.length - 1], value)
        : null
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        const fromArray = findBalanceValue(value[i], path, depth + 1)
        if (fromArray !== null) return fromArray
      }
      return null
    }

    const keys = Object.keys(value)
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i]
      if (!keyLooksLikeBalance(key)) continue
      const direct = normalizeBalanceFromKey(key, value[key])
      if (direct !== null) return direct
      if (value[key] && typeof value[key] === "object") {
        const nestedBalance = findBalanceValue(value[key], path.concat(key), depth + 1)
        if (nestedBalance !== null) return nestedBalance
      }
    }

    for (let i = 0; i < keys.length; i += 1) {
      const found = findBalanceValue(value[keys[i]], path.concat(keys[i]), depth + 1)
      if (found !== null) return found
    }

    return null
  }

  function formatDollars(value) {
    const rounded = Math.round(value * 100) / 100
    return "$" + rounded.toFixed(2)
  }

  function readZenBalance(ctx, text) {
    const parsed = ctx.util.tryParseJson(text)
    let balance = parsed ? findBalanceValue(parsed, [], 0) : null

    if (balance === null) {
      const balanceMatch = String(text).match(
        /(?:currentBalance|balance|creditBalance|credits|guthaben)\s*[:=]\s*["']?\$?([0-9]+(?:[,.][0-9]+)?)/i
      )
      if (balanceMatch) balance = readCurrencyNumber(balanceMatch[1].replace(",", "."))
    }

    if (balance === null) {
      const centsMatch = String(text).match(
        /(?:balanceCents|creditCents|balanceMinor|creditMinor)\s*[:=]\s*["']?([0-9]+)/i
      )
      if (centsMatch) balance = Number(centsMatch[1]) / 100
    }

    return balance
  }

  function textIncludesGoSubscription(value) {
    if (typeof value !== "string") return false
    const lower = value.toLowerCase()
    const normalized = lower.replace(/[^a-z0-9]/g, "")
    return (
      normalized === "gosubscription" ||
      normalized === "opencodegosubscription" ||
      normalized === "goplan" ||
      normalized === "opencodegoplan"
    )
  }

  function objectHasActiveGoSubscription(value, depth) {
    if (depth > 7 || value === null || value === undefined) return false
    if (typeof value === "string") return textIncludesGoSubscription(value)
    if (typeof value !== "object") return false

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        if (objectHasActiveGoSubscription(value[i], depth + 1)) return true
      }
      return false
    }

    const keys = Object.keys(value)
    const joined = keys.map((key) => key.toLowerCase()).join(" ")
    const hasGoKey =
      joined.indexOf("go") !== -1 ||
      joined.indexOf("opencode-go") !== -1 ||
      joined.indexOf("subscription") !== -1 ||
      joined.indexOf("plan") !== -1
    const status =
      typeof value.status === "string"
        ? value.status.toLowerCase()
        : typeof value.state === "string"
          ? value.state.toLowerCase()
          : ""
    if (
      hasGoKey &&
      (status === "active" ||
        status === "trialing" ||
        value.active === true ||
        value.subscribed === true ||
        value.isSubscribed === true)
    ) {
      return true
    }

    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i]
      if (textIncludesGoSubscription(key) && value[key] === true) return true
      if (
        textIncludesGoSubscription(key) &&
        value[key] &&
        typeof value[key] === "object" &&
        (value[key].active === true ||
          value[key].subscribed === true ||
          value[key].isSubscribed === true ||
          String(value[key].status || value[key].state || "").toLowerCase() === "active" ||
          String(value[key].status || value[key].state || "").toLowerCase() === "trialing")
      ) {
        return true
      }
      if (objectHasActiveGoSubscription(value[key], depth + 1)) return true
    }

    return false
  }

  function hasActiveGoSubscription(ctx, text) {
    const parsed = ctx.util.tryParseJson(text)
    if (parsed && objectHasActiveGoSubscription(parsed, 0)) return true
    return false
  }

  function loadZenBalanceLine(ctx) {
    const cookieHeader = readZenCookieHeader(ctx)
    if (!cookieHeader) return null

    const workspaceId = resolveWorkspaceId(ctx, cookieHeader.value)
    const referer = BASE_URL + "/workspace/" + workspaceId + "/billing"
    const text = requestServer(ctx, {
      method: "GET",
      serverId: SUBSCRIPTION_SERVER_ID,
      args: [workspaceId],
      cookieHeader: cookieHeader.value,
      referer,
    })

    let accountText = text
    let balance = String(text).trim() === "null" ? null : readZenBalance(ctx, text)
    if (balance === null) {
      accountText = requestBillingPage(ctx, { workspaceId, cookieHeader: cookieHeader.value })
      balance = readZenBalance(ctx, accountText)
    }
    if (balance === null) throw "OpenCode Zen balance was not found in billing data."

    return {
      hasActiveGoSubscription: hasActiveGoSubscription(ctx, accountText),
      lines: [
        ctx.line.text({
          label: "Zen balance",
          value: formatDollars(balance),
          subtitle: "OpenCode Zen pay-as-you-go balance",
        }),
        ctx.line.text({
          label: "Zen source",
          value: "OpenCode Zen signed-in website billing session",
        }),
        ctx.line.text({
          label: "Zen auth source",
          value: cookieHeader.source,
        }),
        ctx.line.text({
          label: "Zen endpoint",
          value: SERVER_URL,
        }),
      ],
    }
  }

  function appendZenBalanceLine(ctx, lines) {
    try {
      const zen = loadZenBalanceLine(ctx)
      return zen ? lines.concat(zen.lines) : lines
    } catch (e) {
      if (ctx.host.log && typeof ctx.host.log.warn === "function") {
        ctx.host.log.warn("opencode-go zen balance read failed: " + String(e))
      }
      return lines
    }
  }

  function toIso(ms) {
    if (!Number.isFinite(ms)) return null
    return new Date(ms).toISOString()
  }

  function readGoErrorType(ctx, bodyText) {
    const payload = ctx.util.tryParseJson(bodyText)
    if (!payload || typeof payload !== "object") return null
    const error = payload.error
    if (!error || typeof error !== "object") return null
    return typeof error.type === "string" && error.type.trim() ? error.type.trim() : null
  }

  function readGoUsage(ctx, apiKey) {
    let response
    try {
      response = ctx.host.http.request({
        method: "GET",
        url: GO_USAGE_URL,
        headers: {
          Authorization: "Bearer " + apiKey,
          Accept: "application/json",
        },
        timeoutMs: 15000,
      })
    } catch {
      throw "OpenCode Go usage request failed. Check your connection."
    }

    if (!response || typeof response.status !== "number") {
      throw "OpenCode Go usage response invalid."
    }
    if (response.status === 401) {
      throw "OpenCode Go API key invalid. Log into OpenCode Go again."
    }
    if (response.status === 403) {
      if (readGoErrorType(ctx, response.bodyText) === "EntitlementError") return null
      throw "OpenCode Go usage request forbidden."
    }
    if (response.status < 200 || response.status >= 300) {
      throw "OpenCode Go usage request failed (HTTP " + response.status + ")."
    }

    const payload = ctx.util.tryParseJson(response.bodyText)
    const usage = payload && typeof payload === "object" ? payload.usage : null
    if (!usage || typeof usage !== "object") {
      throw "OpenCode Go usage response invalid."
    }

    const windows = [
      { key: "rolling", label: "5h", periodDurationMs: FIVE_HOURS_MS },
      { key: "weekly", label: "Weekly", periodDurationMs: WEEK_MS },
      { key: "monthly", label: "Monthly", periodDurationMs: MONTH_MS },
    ]
    const lines = []
    for (let i = 0; i < windows.length; i += 1) {
      const definition = windows[i]
      const window = usage[definition.key]
      const percent = window && typeof window === "object" ? readNumber(window.percent) : null
      if (percent === null || percent < 0) throw "OpenCode Go usage response invalid."

      const opts = {
        label: definition.label,
        used: percent,
        limit: 100,
        format: { kind: "percent" },
        periodDurationMs: definition.periodDurationMs,
      }
      const resetsAt = window && typeof window === "object" ? ctx.util.toIso(window.resetsAt) : null
      if (resetsAt) opts.resetsAt = resetsAt
      lines.push(ctx.line.progress(opts))
    }
    return lines
  }

  function countFreeRange(rows, startMs, endMs) {
    let total = 0
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]
      if (row.createdMs < startMs || row.createdMs >= endMs) continue
      if (!isFreeModel(row.modelId)) continue
      total += 1
    }
    return total
  }

  function isFreeModel(modelId) {
    if (typeof modelId !== "string") return false
    const normalized = modelId.toLowerCase()
    return (
      normalized === "big-pickle" ||
      normalized.indexOf("-free") !== -1 ||
      normalized.indexOf(":free") !== -1 ||
      normalized.indexOf("free") !== -1
    )
  }

  function nextRollingReset(rows, nowMs) {
    const startMs = nowMs - FIVE_HOURS_MS
    let oldest = null
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]
      if (row.createdMs < startMs || row.createdMs >= nowMs) continue
      if (oldest === null || row.createdMs < oldest) oldest = row.createdMs
    }
    return toIso((oldest === null ? nowMs : oldest) + FIVE_HOURS_MS)
  }

  function queryRows(ctx, sql) {
    try {
      const raw = ctx.host.sqlite.query(DB_PATH, sql)
      const rows = Array.isArray(raw) ? raw : ctx.util.tryParseJson(raw)
      if (!Array.isArray(rows)) {
        ctx.host.log.warn("sqlite query returned non-array result")
        return { ok: false, rows: [] }
      }
      return { ok: true, rows }
    } catch (e) {
      ctx.host.log.warn("sqlite query failed: " + String(e))
      return { ok: false, rows: [] }
    }
  }

  function loadAuthProfile(ctx) {
    if (!ctx.host.fs.exists(AUTH_PATH)) return null

    try {
      const text = ctx.host.fs.readText(AUTH_PATH)
      const parsed = ctx.util.tryParseJson(text)
      if (!parsed || typeof parsed !== "object") {
        ctx.host.log.warn("opencode auth file is not valid json")
        return null
      }
      for (let i = 0; i < AUTH_ENTRY_KEYS.length; i += 1) {
        const entry = parsed[AUTH_ENTRY_KEYS[i]]
        if (!entry || typeof entry !== "object") continue
        const key = typeof entry.key === "string" ? entry.key.trim() : ""
        if (key) {
          return {
            key,
          }
        }
      }
      return null
    } catch (e) {
      ctx.host.log.warn("opencode auth read failed: " + String(e))
      return null
    }
  }

  function hasHistory(ctx) {
    const result = queryRows(ctx, HISTORY_EXISTS_SQL)
    if (!result.ok) return { ok: false, present: false }
    return { ok: true, present: result.rows.length > 0 }
  }

  function loadHistory(ctx) {
    const result = queryRows(ctx, HISTORY_ROWS_SQL)
    if (!result.ok) return result

    const rows = []
    for (let i = 0; i < result.rows.length; i += 1) {
      const row = result.rows[i]
      if (!row || typeof row !== "object") continue
      const createdMs = readNumber(row.createdMs)
      const cost = readNumber(row.cost)
      const modelId = typeof row.modelId === "string" ? row.modelId : null
      if (createdMs === null || createdMs <= 0) continue
      if (cost === null || cost < 0) continue
      rows.push({ createdMs, modelId, cost })
    }

    return { ok: true, rows }
  }

  function buildSoftEmptyLines(ctx) {
    return [
      ctx.line.badge({
        label: "Status",
        text: "No Go usage data",
        color: "#a3a3a3",
      }),
    ]
  }

  function buildFreeUsageLines(ctx, rows, nowMs) {
    const sessionStartMs = nowMs - FIVE_HOURS_MS
    const sessionRequests = countFreeRange(rows, sessionStartMs, nowMs)
    return [
      ctx.line.progress({
        label: "Free",
        used: sessionRequests,
        limit: FREE_LIMITS.sessionRequests,
        format: { kind: "count", suffix: "requests" },
        resetsAt: nextRollingReset(rows, nowMs),
        periodDurationMs: FIVE_HOURS_MS,
      }),
    ]
  }

  function buildNotSubscribedLines(ctx) {
    return [
      ctx.line.badge({
        label: "Status",
        text: "No Go subscription usage",
        color: "#a3a3a3",
        subtitle: "Zen auth exists, but no local Go usage was found.",
      }),
    ]
  }

  function probe(ctx) {
    const authProfile = loadAuthProfile(ctx)
    const history = hasHistory(ctx)
    const detected = !!authProfile || (history.ok && history.present)

    if (!detected) {
      throw "OpenCode Go not detected. Log in with OpenCode Go or use it locally first."
    }

    const goLines = authProfile && authProfile.key ? readGoUsage(ctx, authProfile.key) : null
    if (goLines) {
      const lines = appendZenBalanceLine(ctx, goLines)
      return { plan: PLAN.go, lines }
    }

    if (!history.ok) {
      return {
        plan: PLAN.free,
        lines: appendZenBalanceLine(ctx, buildSoftEmptyLines(ctx)),
      }
    }

    if (!history.present) {
      return {
        plan: PLAN.free,
        lines: appendZenBalanceLine(ctx, buildNotSubscribedLines(ctx)),
      }
    }

    const rowsResult = loadHistory(ctx)
    if (!rowsResult.ok) {
      return {
        plan: PLAN.free,
        lines: appendZenBalanceLine(ctx, buildSoftEmptyLines(ctx)),
      }
    }

    const freeLines = buildFreeUsageLines(ctx, rowsResult.rows, readNowMs())
    return { plan: PLAN.free, lines: freeLines }
  }

  function addCcusageHistory(ctx, result) {
    if (
      !result ||
      result.history ||
      !ctx.host.ccusage ||
      typeof ctx.host.ccusage.query !== "function"
    )
      return result
    var sinceDate = new Date(ctx.nowIso || Date.now())
    sinceDate.setDate(sinceDate.getDate() - 30)
    var since =
      sinceDate.getFullYear() +
      String(sinceDate.getMonth() + 1).padStart(2, "0") +
      String(sinceDate.getDate()).padStart(2, "0")
    var usage = ctx.host.ccusage.query({ provider: "opencode", since: since }),
      daily =
        usage && usage.status === "ok" && usage.data && Array.isArray(usage.data.daily)
          ? usage.data.daily
          : [],
      entries = []
    for (var i = 0; i < daily.length; i += 1) {
      var m = String((daily[i] && daily[i].date) || "").match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!m) continue
      var start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      var end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1)
      var rows =
        Array.isArray(daily[i].modelBreakdowns) && daily[i].modelBreakdowns.length
          ? daily[i].modelBreakdowns
          : [daily[i]]
      for (var j = 0; j < rows.length; j += 1) {
        var row = rows[j] || {},
          entry = { periodStart: start.toISOString(), periodEnd: end.toISOString() },
          model = String(row.modelName || row.model || "").trim(),
          input = Number(row.inputTokens),
          output = Number(row.outputTokens),
          cacheRead = Number(row.cacheReadTokens),
          cacheCreation = Number(row.cacheCreationTokens),
          reasoning = Number(row.reasoningTokens),
          total = Number(row.totalTokens),
          cost = Number(row.cost != null ? row.cost : row.totalCost)
        if (model) entry.model = model
        if (Number.isFinite(input) && input >= 0) entry.inputTokens = input
        if (Number.isFinite(output) && output >= 0) entry.outputTokens = output
        if (Number.isFinite(cacheRead) && cacheRead >= 0) entry.cacheReadTokens = cacheRead
        if (Number.isFinite(cacheCreation) && cacheCreation >= 0)
          entry.cacheCreationTokens = cacheCreation
        if (Number.isFinite(reasoning) && reasoning >= 0) entry.reasoningTokens = reasoning
        if (Number.isFinite(total) && total >= 0) entry.totalTokens = total
        if (Number.isFinite(cost) && cost >= 0) entry.costUsd = cost
        if (Object.keys(entry).length > 2) entries.push(entry)
      }
    }
    if (entries.length)
      result.history = { version: 1, source: "ccusage", timeZone: "system-local", entries: entries }
    return result
  }
  var probeCore = probe
  globalThis.__openusage_plugin = {
    id: PROVIDER_ID,
    probe: function (ctx) {
      return addCcusageHistory(ctx, probeCore(ctx))
    },
  }
})()
