(function () {
  var BASE_URL = "https://opencode.ai"
  var SERVER_URL = BASE_URL + "/_server"
  var WORKSPACES_SERVER_ID = "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f"
  var SUBSCRIPTION_SERVER_ID = "7abeebee372f304e050aaaf92be863f4a86490e382f8c79db68fd94040d691b4"
  var COOKIE_HEADER_SERVICE = "OpenCode Cookie Header"

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
    if (!ctx.host.providerSecrets || typeof ctx.host.providerSecrets.read !== "function") return null
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
    var envValue = readEnv(ctx, "OPENCODE_COOKIE_HEADER")
    if (envValue) return envValue

    var source = readProviderConfig(ctx, "source") || "manual"
    if (source === "auto") {
      throw "OpenCode automatic browser import is not available in this OpenUsage build yet. Switch Source to Manual."
    }

    var providerSecret = readProviderSecret(ctx, "cookieHeader")
    if (providerSecret) return providerSecret

    if (ctx.host.keychain && typeof ctx.host.keychain.readGenericPassword === "function") {
      try {
        var stored = ctx.host.keychain.readGenericPassword(COOKIE_HEADER_SERVICE)
        if (typeof stored === "string" && stored.trim()) return stored.trim()
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
      url: opts.method === "GET"
        ? SERVER_URL + "?id=" + encodeURIComponent(opts.serverId) +
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

  function findWindowUsage(value, keys) {
    if (!value || typeof value !== "object") return null
    for (var i = 0; i < keys.length; i++) {
      var direct = value[keys[i]]
      if (direct && typeof direct === "object") return direct
    }
    var objectKeys = Object.keys(value)
    for (var j = 0; j < objectKeys.length; j++) {
      var nested = value[objectKeys[j]]
      if (!nested || typeof nested !== "object") continue
      var found = findWindowUsage(nested, keys)
      if (found) return found
    }
    return null
  }

  function readNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
      var parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
    return null
  }

  function summarizeSubscriptionShape(parsed) {
    if (!parsed || typeof parsed !== "object") return "response was not valid JSON"
    var keys = Object.keys(parsed).slice(0, 8)
    if (keys.length === 0) return "response JSON object was empty"
    return "top-level keys: " + keys.join(", ")
  }

  function parseSubscription(ctx, text, nowMs, workspaceId) {
    var parsed = ctx.util.tryParseJson(text)
    var rolling = parsed
      ? findWindowUsage(parsed, ["rollingUsage", "rolling", "rolling_usage", "rollingWindow"])
      : null
    var weekly = parsed
      ? findWindowUsage(parsed, ["weeklyUsage", "weekly", "weekly_usage", "weeklyWindow"])
      : null

    var rollingPercent = rolling ? readNumber(rolling.usagePercent || rolling.percent) : null
    var rollingReset = rolling ? readNumber(rolling.resetInSec || rolling.resetSeconds) : null
    var weeklyPercent = weekly ? readNumber(weekly.usagePercent || weekly.percent) : null
    var weeklyReset = weekly ? readNumber(weekly.resetInSec || weekly.resetSeconds) : null

    if (rollingPercent === null) {
      var rollingPercentMatch = text.match(/rollingUsage[^}]*?usagePercent\s*:\s*([0-9]+(?:\.[0-9]+)?)/)
      rollingPercent = rollingPercentMatch ? Number(rollingPercentMatch[1]) : null
    }
    if (rollingReset === null) {
      var rollingResetMatch = text.match(/rollingUsage[^}]*?resetInSec\s*:\s*([0-9]+)/)
      rollingReset = rollingResetMatch ? Number(rollingResetMatch[1]) : null
    }
    if (weeklyPercent === null) {
      var weeklyPercentMatch = text.match(/weeklyUsage[^}]*?usagePercent\s*:\s*([0-9]+(?:\.[0-9]+)?)/)
      weeklyPercent = weeklyPercentMatch ? Number(weeklyPercentMatch[1]) : null
    }
    if (weeklyReset === null) {
      var weeklyResetMatch = text.match(/weeklyUsage[^}]*?resetInSec\s*:\s*([0-9]+)/)
      weeklyReset = weeklyResetMatch ? Number(weeklyResetMatch[1]) : null
    }

    var missing = []
    if (rollingPercent === null) missing.push("rolling usage percent")
    if (rollingReset === null) missing.push("rolling reset")
    if (weeklyPercent === null) missing.push("weekly usage percent")
    if (weeklyReset === null) missing.push("weekly reset")

    if (missing.length > 0) {
      var summary = summarizeSubscriptionShape(parsed)
      if (ctx.host.log && typeof ctx.host.log.warn === "function") {
        ctx.host.log.warn(
          "opencode subscription response missing fields for " +
            workspaceId +
            ": " +
            missing.join(", ") +
            " (" +
            summary +
            ")"
        )
      }
      throw (
        "OpenCode returned billing data for workspace " +
        workspaceId +
        ", but it did not include the expected usage fields (" +
        missing.join(", ") +
        "). Verify the workspace ID from the billing URL or an opencode.ai/_server payload. If that workspace is correct, OpenCode likely changed the billing response shape."
      )
    }

    return {
      rollingPercent: rollingPercent,
      rollingResetIso: new Date(nowMs + rollingReset * 1000).toISOString(),
      weeklyPercent: weeklyPercent,
      weeklyResetIso: new Date(nowMs + weeklyReset * 1000).toISOString(),
    }
  }

  function probe(ctx) {
    var cookieHeader = readCookieHeader(ctx)
    var workspaceId = resolveWorkspaceId(ctx, cookieHeader)
    var referer = BASE_URL + "/workspace/" + workspaceId + "/billing"
    var text = requestServer(ctx, {
      method: "GET",
      serverId: SUBSCRIPTION_SERVER_ID,
      args: [workspaceId],
      cookieHeader: cookieHeader,
      referer: referer,
    })

    if (String(text).trim() === "null") {
      throw "OpenCode has no subscription usage data for this workspace."
    }

    var usage = parseSubscription(ctx, text, Date.now(), workspaceId)
    return {
      lines: [
        ctx.line.progress({
          label: "Session",
          used: usage.rollingPercent,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: usage.rollingResetIso,
          periodDurationMs: 5 * 60 * 60 * 1000,
        }),
        ctx.line.progress({
          label: "Weekly",
          used: usage.weeklyPercent,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: usage.weeklyResetIso,
          periodDurationMs: 7 * 24 * 60 * 60 * 1000,
        }),
      ],
    }
  }

  globalThis.__openusage_plugin = { id: "opencode", probe: probe }
})()
