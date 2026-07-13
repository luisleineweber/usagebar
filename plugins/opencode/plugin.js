;(function () {
  var BASE_URL = "https://opencode.ai"
  var SERVER_URL = BASE_URL + "/_server"
  var WORKSPACES_SERVER_ID = "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f"
  var SUBSCRIPTION_SERVER_ID = "7abeebee372f304e050aaaf92be863f4a86490e382f8c79db68fd94040d691b4"
  var COOKIE_HEADER_SERVICE = "OpenCode Cookie Header"
  var OPENCODE_DB_PATHS = [
    "~/.local/share/opencode/opencode.db",
    "~/Library/Application Support/opencode/opencode.db",
    "~/AppData/Local/opencode/opencode.db",
  ]
  var HISTORY_PROVIDER_SQL = "'opencode-go', 'opencode'"

  function randomInstanceId() {
    return "server-fn:" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2)
  }

  function readEnv(ctx, name) {
    if (!ctx.host.env || typeof ctx.host.env.get !== "function") return null
    try {
      var value = ctx.host.env.get(name)
      if (typeof value !== "string") return null
      value = value.trim()
      return value || null
    } catch {
      return null
    }
  }

  function readProviderConfig(ctx, key) {
    if (!ctx.host.providerConfig || typeof ctx.host.providerConfig.get !== "function") return null
    try {
      var value = ctx.host.providerConfig.get(key)
      if (typeof value !== "string") return null
      value = value.trim()
      return value || null
    } catch {
      return null
    }
  }

  function readProviderSecret(ctx, key) {
    if (!ctx.host.providerSecrets || typeof ctx.host.providerSecrets.read !== "function")
      return null
    try {
      var value = ctx.host.providerSecrets.read(key)
      if (typeof value !== "string") return null
      value = value.trim()
      return value || null
    } catch {
      return null
    }
  }

  function readCookieHeader(ctx) {
    var source = readProviderConfig(ctx, "source") || "manual"
    if (source === "auto") {
      throw "OpenCode automatic browser import is not available in this OpenUsage build yet. Switch Source to Manual."
    }

    var providerSecret = readProviderSecret(ctx, "cookieHeader")
    if (providerSecret) return { value: providerSecret, source: "Stored Cookie header" }

    var envValue = readEnv(ctx, "OPENCODE_COOKIE_HEADER")
    if (envValue) return { value: envValue, source: "OPENCODE_COOKIE_HEADER" }

    if (ctx.host.keychain && typeof ctx.host.keychain.readGenericPassword === "function") {
      try {
        var stored = ctx.host.keychain.readGenericPassword(COOKIE_HEADER_SERVICE)
        if (typeof stored === "string" && stored.trim()) {
          return { value: stored.trim(), source: "Legacy keychain Cookie header" }
        }
      } catch {}
    }
    throw "Set OPENCODE_COOKIE_HEADER to your OpenCode cookie header."
  }

  function normalizeWorkspaceId(raw) {
    if (typeof raw !== "string") return null
    var trimmed = raw.trim()
    if (!trimmed) return null
    if (/^wrk_[A-Za-z0-9]+$/.test(trimmed)) return trimmed
    var direct = trimmed.match(/wrk_[A-Za-z0-9]+/)
    return direct ? direct[0] : null
  }

  function requestServer(ctx, opts) {
    var request = {
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
    var response = ctx.host.http.request(request)
    if (response.status === 401 || response.status === 403) {
      throw "OpenCode session cookie is invalid or expired."
    }
    if (response.status < 200 || response.status >= 300) {
      throw "OpenCode request failed (HTTP " + response.status + ")."
    }
    return response.bodyText
  }

  function requestBillingPage(ctx, opts) {
    var response = ctx.host.http.request({
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
      throw "OpenCode session cookie is invalid or expired."
    }
    if (response.status < 200 || response.status >= 300) {
      throw "OpenCode billing page request failed (HTTP " + response.status + ")."
    }
    return response.bodyText
  }

  function collectWorkspaceIds(value, out) {
    if (!value) return
    if (typeof value === "string") {
      var match = normalizeWorkspaceId(value)
      if (match && out.indexOf(match) === -1) out.push(match)
      return
    }
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) collectWorkspaceIds(value[i], out)
      return
    }
    if (typeof value === "object") {
      var keys = Object.keys(value)
      for (var j = 0; j < keys.length; j++) collectWorkspaceIds(value[keys[j]], out)
    }
  }

  function parseWorkspaceIds(ctx, text) {
    var ids = []
    var regex = /id\s*:\s*"(wrk_[^"]+)"/g
    var match
    while ((match = regex.exec(text))) {
      if (ids.indexOf(match[1]) === -1) ids.push(match[1])
    }
    if (ids.length > 0) return ids
    var parsed = ctx.util.tryParseJson(text)
    if (!parsed) return ids
    collectWorkspaceIds(parsed, ids)
    return ids
  }

  function resolveWorkspaceId(ctx, cookieHeader) {
    var override =
      normalizeWorkspaceId(readEnv(ctx, "OPENCODE_WORKSPACE_ID")) ||
      normalizeWorkspaceId(readProviderConfig(ctx, "workspaceId"))
    if (override) return override

    var first = requestServer(ctx, {
      method: "GET",
      serverId: WORKSPACES_SERVER_ID,
      args: null,
      cookieHeader: cookieHeader,
      referer: BASE_URL,
    })
    var ids = parseWorkspaceIds(ctx, first)
    if (ids.length > 0) return ids[0]

    var fallback = requestServer(ctx, {
      method: "POST",
      serverId: WORKSPACES_SERVER_ID,
      args: [],
      cookieHeader: cookieHeader,
      referer: BASE_URL,
    })
    ids = parseWorkspaceIds(ctx, fallback)
    if (ids.length > 0) return ids[0]
    throw "OpenCode workspace not found. Set OPENCODE_WORKSPACE_ID."
  }

  function summarizeBillingShape(parsed) {
    if (!parsed || typeof parsed !== "object") return "response was not valid JSON"
    var keys = Object.keys(parsed).slice(0, 8)
    if (keys.length === 0) return "response JSON object was empty"
    return "top-level keys: " + keys.join(", ")
  }

  function readCurrencyNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value !== "string") return null
    var cleaned = value.trim().replace(/[$,\s]/g, "")
    if (!cleaned) return null
    var parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }

  function keyLooksLikeBalance(key) {
    var lower = String(key || "").toLowerCase()
    if (lower.indexOf("balance") !== -1) return true
    if (lower.indexOf("credit") !== -1 && lower.indexOf("card") === -1) return true
    if (lower.indexOf("guthaben") !== -1) return true
    return false
  }

  function normalizeBalanceFromKey(key, value) {
    var number = readCurrencyNumber(value)
    if (number === null) return null
    var lower = String(key || "").toLowerCase()
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
      for (var i = 0; i < value.length; i++) {
        var fromArray = findBalanceValue(value[i], path, depth + 1)
        if (fromArray !== null) return fromArray
      }
      return null
    }

    var keys = Object.keys(value)
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j]
      if (!keyLooksLikeBalance(key)) continue
      var direct = normalizeBalanceFromKey(key, value[key])
      if (direct !== null) return direct
      if (value[key] && typeof value[key] === "object") {
        var nestedBalance = findBalanceValue(value[key], path.concat(key), depth + 1)
        if (nestedBalance !== null) return nestedBalance
      }
    }

    for (var k = 0; k < keys.length; k++) {
      var found = findBalanceValue(value[keys[k]], path.concat(keys[k]), depth + 1)
      if (found !== null) return found
    }

    return null
  }

  function formatDollars(value) {
    var rounded = Math.round(value * 100) / 100
    return "$" + rounded.toFixed(2)
  }

  function readNumber(value) {
    var number = Number(value)
    return Number.isFinite(number) ? number : null
  }

  function startOfUtcDay(ms) {
    var date = new Date(ms)
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  }

  function resolveOpenCodeDbPath(ctx) {
    if (ctx.host.fs && typeof ctx.host.fs.exists === "function") {
      for (var i = 0; i < OPENCODE_DB_PATHS.length; i += 1) {
        try {
          if (ctx.host.fs.exists(OPENCODE_DB_PATHS[i])) return OPENCODE_DB_PATHS[i]
        } catch {}
      }
    }
    return OPENCODE_DB_PATHS[0]
  }

  function loadCostHistoryRows(ctx, dbPath, sinceMs, untilMs) {
    if (!ctx.host.sqlite || typeof ctx.host.sqlite.query !== "function") {
      return { ok: false, rows: [] }
    }

    var sql = `
      SELECT
        CAST(COALESCE(json_extract(data, '$.time.created'), time_created) AS INTEGER) AS createdMs,
        CAST(json_extract(data, '$.cost') AS REAL) AS cost
      FROM message
      WHERE json_valid(data)
        AND json_extract(data, '$.providerID') IN (${HISTORY_PROVIDER_SQL})
        AND json_extract(data, '$.role') = 'assistant'
        AND json_type(data, '$.cost') IN ('integer', 'real')
        AND CAST(COALESCE(json_extract(data, '$.time.created'), time_created) AS INTEGER) >= ${Math.floor(sinceMs)}
        AND CAST(COALESCE(json_extract(data, '$.time.created'), time_created) AS INTEGER) < ${Math.floor(untilMs)}
    `

    try {
      var raw = ctx.host.sqlite.query(dbPath, sql)
      var parsed = Array.isArray(raw) ? raw : ctx.util.tryParseJson(raw)
      if (!Array.isArray(parsed)) return { ok: false, rows: [] }

      var rows = []
      for (var i = 0; i < parsed.length; i += 1) {
        var row = parsed[i]
        if (!row || typeof row !== "object") continue
        var createdMs = readNumber(row.createdMs)
        var cost = readNumber(row.cost)
        if (createdMs === null || createdMs < sinceMs || createdMs >= untilMs) continue
        if (cost === null || cost < 0) continue
        rows.push({ createdMs: createdMs, cost: cost })
      }
      return { ok: true, rows: rows }
    } catch {
      return { ok: false, rows: [] }
    }
  }

  function formatCostWindow(rows, startMs, endMs) {
    var total = 0
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i]
      if (row.createdMs < startMs || row.createdMs >= endMs) continue
      total += row.cost
    }
    return formatDollars(total)
  }

  function buildCostReport(ctx) {
    var nowMs = Date.parse(ctx.nowIso || "")
    if (!Number.isFinite(nowMs)) nowMs = Date.now()
    var todayStartMs = startOfUtcDay(nowMs)
    var yesterdayStartMs = todayStartMs - 24 * 60 * 60 * 1000
    var last2StartMs = todayStartMs - 2 * 24 * 60 * 60 * 1000
    var last30StartMs = todayStartMs - 30 * 24 * 60 * 60 * 1000
    var dbPath = resolveOpenCodeDbPath(ctx)
    var result = loadCostHistoryRows(ctx, dbPath, last30StartMs, nowMs)
    if (!result.ok) return { lines: [], history: undefined }

    var dailyCosts = new Map()
    for (var i = 0; i < result.rows.length; i += 1) {
      var row = result.rows[i]
      var dayStartMs = startOfUtcDay(row.createdMs)
      dailyCosts.set(dayStartMs, (dailyCosts.get(dayStartMs) || 0) + row.cost)
    }
    var entries = Array.from(dailyCosts.entries())
      .sort(function (a, b) {
        return a[0] - b[0]
      })
      .map(function (entry) {
        return {
          periodStart: new Date(entry[0]).toISOString(),
          periodEnd: new Date(entry[0] + 24 * 60 * 60 * 1000).toISOString(),
          costUsd: entry[1],
        }
      })

    return {
      lines: [
        ctx.line.text({
          label: "Yesterday",
          value: formatCostWindow(result.rows, yesterdayStartMs, todayStartMs),
          subtitle: "Local OpenCode assistant spend",
        }),
        ctx.line.text({
          label: "Last 2 days",
          value: formatCostWindow(result.rows, last2StartMs, nowMs),
          subtitle: "Local OpenCode assistant spend",
        }),
        ctx.line.text({
          label: "Last 30 days",
          value: formatCostWindow(result.rows, last30StartMs, nowMs),
          subtitle: "Local OpenCode assistant spend",
        }),
      ],
      history: {
        version: 1,
        source: "opencode-sqlite",
        timeZone: "UTC",
        entries: entries,
      },
    }
  }

  function readZenBalance(ctx, text) {
    var parsed = ctx.util.tryParseJson(text)
    var balance = parsed ? findBalanceValue(parsed, [], 0) : null

    if (balance === null) {
      var balanceMatch = String(text).match(
        /(?:currentBalance|balance|creditBalance|credits|guthaben)\s*[:=]\s*["']?\$?([0-9]+(?:[,.][0-9]+)?)/i
      )
      if (balanceMatch) balance = readCurrencyNumber(balanceMatch[1].replace(",", "."))
    }

    if (balance === null) {
      var centsMatch = String(text).match(
        /(?:balanceCents|creditCents|balanceMinor|creditMinor)\s*[:=]\s*["']?([0-9]+)/i
      )
      if (centsMatch) balance = Number(centsMatch[1]) / 100
    }

    return { balance: balance, parsed: parsed }
  }

  function parseZenBalance(ctx, text, workspaceId) {
    var result = readZenBalance(ctx, text)
    var balance = result.balance

    if (balance === null) {
      var summary = summarizeBillingShape(result.parsed)
      if (ctx.host.log && typeof ctx.host.log.warn === "function") {
        ctx.host.log.warn(
          "opencode zen billing response missing balance for " + workspaceId + " (" + summary + ")"
        )
      }
      throw (
        "OpenCode returned billing data for workspace " +
        workspaceId +
        ", but it did not include the expected Zen balance field. Verify the workspace ID from the billing URL or an opencode.ai/_server payload. If that workspace is correct, OpenCode likely changed the billing response shape."
      )
    }

    return balance
  }

  function probe(ctx) {
    var cookieHeader = readCookieHeader(ctx)
    var workspaceId = resolveWorkspaceId(ctx, cookieHeader.value)
    var referer = BASE_URL + "/workspace/" + workspaceId + "/billing"
    var text = requestServer(ctx, {
      method: "GET",
      serverId: SUBSCRIPTION_SERVER_ID,
      args: [workspaceId],
      cookieHeader: cookieHeader.value,
      referer: referer,
    })

    if (String(text).trim() === "null") {
      throw "OpenCode Zen has no billing usage data for this workspace."
    }

    var balanceResult = readZenBalance(ctx, text)
    var balance = balanceResult.balance
    if (balance === null) {
      var billingPageText = requestBillingPage(ctx, {
        workspaceId: workspaceId,
        cookieHeader: cookieHeader.value,
      })
      balance = readZenBalance(ctx, billingPageText).balance
    }
    if (balance === null) balance = parseZenBalance(ctx, text, workspaceId)

    var lines = [
      ctx.line.text({
        label: "Balance",
        value: formatDollars(balance),
        subtitle: "OpenCode Zen pay-as-you-go balance",
      }),
      ctx.line.text({
        label: "Source",
        value: "OpenCode Zen signed-in website billing session",
      }),
      ctx.line.text({
        label: "Auth source",
        value: cookieHeader.source,
      }),
      ctx.line.text({
        label: "Endpoint",
        value: SERVER_URL,
      }),
    ]

    var costReport = buildCostReport(ctx)
    for (var i = 0; i < costReport.lines.length; i += 1) lines.push(costReport.lines[i])

    return {
      lines: lines,
      history: costReport.history,
    }
  }

  globalThis.__openusage_plugin = { id: "opencode", probe: probe }
})()
