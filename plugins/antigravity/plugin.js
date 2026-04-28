(function () {
  var LS_SERVICE = "exa.language_server_pb.LanguageServerService"
  var CLOUD_CODE_URLS = [
    "https://daily-cloudcode-pa.googleapis.com",
    "https://cloudcode-pa.googleapis.com",
  ]
  var FETCH_MODELS_PATH = "/v1internal:fetchAvailableModels"
  var GOOGLE_OAUTH_URL = "https://oauth2.googleapis.com/token"
  var GOOGLE_CLIENT_ID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com"
  var GOOGLE_CLIENT_SECRET = "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"
  var OAUTH_TOKEN_KEY = "antigravityUnifiedStateSync.oauthToken"
  var OAUTH_TOKEN_SENTINEL = "oauthTokenInfoSentinelKey"
  var QUOTA_PERIOD_MS = 5 * 60 * 60 * 1000
  var LIVE_USAGE_CACHE_FILE = "last-live-usage.json"
  var BLACKLISTED_MODEL_IDS = {
    "MODEL_CHAT_20706": true,
    "MODEL_CHAT_23310": true,
    "MODEL_GOOGLE_GEMINI_2_5_FLASH": true,
    "MODEL_GOOGLE_GEMINI_2_5_FLASH_THINKING": true,
    "MODEL_GOOGLE_GEMINI_2_5_FLASH_LITE": true,
    "MODEL_GOOGLE_GEMINI_2_5_PRO": true,
    "MODEL_PLACEHOLDER_M19": true,
  }
  var EXTRA_IMAGE_MODEL_KEY = "gemini-3-pro-image"
  var EXTRA_IMAGE_MODEL_ID = "MODEL_PLACEHOLDER_M9"
  var FAMILY_LABELS = {
    gemini_pro: "Gemini Pro",
    gemini_flash: "Gemini Flash",
    gemini_image: "Gemini Image",
    claude: "Claude",
    other: "Other",
  }
  var FAMILY_PRIORITY = {
    gemini_pro: 0,
    gemini_flash: 1,
    gemini_image: 2,
    claude: 3,
    other: 4,
  }
  var AUTO_GROUP_GEMINI_PRO_ID_SET = {
    "model_placeholder_m7": true,
    "model_placeholder_m8": true,
    "model_placeholder_m36": true,
    "model_placeholder_m37": true,
  }
  var AUTO_GROUP_GEMINI_FLASH_ID_SET = {
    "model_placeholder_m18": true,
  }
  var AUTO_GROUP_GEMINI_IMAGE_ID_SET = {
    "model_placeholder_m9": true,
  }
  var AUTO_GROUP_CLAUDE_ID_SET = {
    "model_claude_4_5_sonnet": true,
    "model_claude_4_5_sonnet_thinking": true,
    "model_placeholder_m12": true,
    "model_placeholder_m26": true,
    "model_placeholder_m35": true,
    "model_openai_gpt_oss_120b_medium": true,
  }
  var AUTO_GROUP_GEMINI_PRO_ID_PATTERN = /^gemini-\d+(?:\.\d+)?-pro-(high|low)(?:-|$)/
  var AUTO_GROUP_GEMINI_FLASH_ID_PATTERN = /^gemini-\d+(?:\.\d+)?-flash(?:-|$)/
  var AUTO_GROUP_GEMINI_IMAGE_ID_PATTERN = /^gemini-\d+(?:\.\d+)?-pro-image(?:-|$)/
  var AUTO_GROUP_GEMINI_PRO_LABEL_PATTERN = /^gemini \d+(?:\.\d+)? pro(?: \((high|low)\)| (high|low))\b/
  var AUTO_GROUP_GEMINI_FLASH_LABEL_PATTERN = /^gemini \d+(?:\.\d+)? flash\b/
  var AUTO_GROUP_GEMINI_IMAGE_LABEL_PATTERN = /^gemini \d+(?:\.\d+)? pro image\b/

  function readVarint(s, pos) {
    var value = 0
    var shift = 0
    while (pos < s.length) {
      var b = s.charCodeAt(pos++)
      value += (b & 0x7f) * Math.pow(2, shift)
      if ((b & 0x80) === 0) return { value: value, pos: pos }
      shift += 7
    }
    return null
  }

  function readFields(s) {
    var fields = {}
    var pos = 0
    while (pos < s.length) {
      var tag = readVarint(s, pos)
      if (!tag) break
      pos = tag.pos
      var fieldNum = Math.floor(tag.value / 8)
      var wireType = tag.value % 8
      if (wireType === 0) {
        var value = readVarint(s, pos)
        if (!value) break
        fields[fieldNum] = { type: 0, value: value.value }
        pos = value.pos
      } else if (wireType === 1) {
        if (pos + 8 > s.length) break
        pos += 8
      } else if (wireType === 2) {
        var length = readVarint(s, pos)
        if (!length) break
        pos = length.pos
        if (pos + length.value > s.length) break
        fields[fieldNum] = { type: 2, data: s.substring(pos, pos + length.value) }
        pos += length.value
      } else if (wireType === 5) {
        if (pos + 4 > s.length) break
        pos += 4
      } else {
        break
      }
    }
    return fields
  }

  function stateDbPath(ctx) {
    if (ctx.app.platform === "windows") return "~/AppData/Roaming/Antigravity/User/globalStorage/state.vscdb"
    if (ctx.app.platform === "linux") return "~/.config/Antigravity/User/globalStorage/state.vscdb"
    return "~/Library/Application Support/Antigravity/User/globalStorage/state.vscdb"
  }

  function lsProcessName(ctx) {
    if (ctx.app.platform === "windows") return "language_server_windows"
    if (ctx.app.platform === "linux") return "language_server_linux"
    return "language_server_macos"
  }

  function lsOsName(ctx) {
    if (ctx.app.platform === "windows") return "windows"
    if (ctx.app.platform === "linux") return "linux"
    return "macos"
  }

  // Antigravity wraps OAuth state in a double-base64 envelope:
  //   b64(outer.f1 = wrapper{ f1=sentinel, f2=payload{ f1=b64(inner proto) } }).
  // The inner base64 layer is a UTF-8 string field, not raw bytes.
  function unwrapOAuthSentinel(ctx, base64Text) {
    var trimmed = String(base64Text || "").replace(/^\s+|\s+$/g, "")
    if (!trimmed) return null
    var outer = ctx.base64.decode(trimmed)
    var outerFields = readFields(outer)
    if (!outerFields[1] || outerFields[1].type !== 2) return null
    var wrapper = readFields(outerFields[1].data)
    var sentinel = wrapper[1] && wrapper[1].type === 2 ? wrapper[1].data : null
    var payload = wrapper[2] && wrapper[2].type === 2 ? wrapper[2].data : null
    if (sentinel !== OAUTH_TOKEN_SENTINEL || !payload) return null
    var payloadFields = readFields(payload)
    if (!payloadFields[1] || payloadFields[1].type !== 2) return null
    var innerText = payloadFields[1].data.replace(/^\s+|\s+$/g, "")
    if (!innerText) return null
    return ctx.base64.decode(innerText)
  }

  function loadOAuthTokens(ctx) {
    try {
      var rows = ctx.host.sqlite.query(
        stateDbPath(ctx),
        "SELECT value FROM ItemTable WHERE key = '" + OAUTH_TOKEN_KEY + "' LIMIT 1"
      )
      var parsed = ctx.util.tryParseJson(rows)
      if (!parsed || !parsed.length || !parsed[0].value) return null
      var inner = unwrapOAuthSentinel(ctx, parsed[0].value)
      if (!inner) return null
      var fields = readFields(inner)
      var accessToken = fields[1] && fields[1].type === 2 ? fields[1].data : null
      var refreshToken = fields[3] && fields[3].type === 2 ? fields[3].data : null
      var expirySeconds = null
      if (fields[4] && fields[4].type === 2) {
        var ts = readFields(fields[4].data)
        if (ts[1] && ts[1].type === 0) expirySeconds = ts[1].value
      }
      if (!accessToken && !refreshToken) return null
      return { accessToken: accessToken, refreshToken: refreshToken, expirySeconds: expirySeconds }
    } catch (e) {
      ctx.host.log.warn("failed to read unified oauth token: " + String(e))
      return null
    }
  }

  function loadCachedToken(ctx) {
    var path = ctx.app.pluginDataDir + "/auth.json"
    try {
      if (!ctx.host.fs.exists(path)) return null
      var data = ctx.util.tryParseJson(ctx.host.fs.readText(path))
      if (!data || !data.accessToken || !data.expiresAtMs) return null
      return { accessToken: data.accessToken, expiresAtMs: data.expiresAtMs }
    } catch (e) {
      ctx.host.log.warn("failed to read cached token: " + String(e))
      return null
    }
  }

  function liveUsageCachePath(ctx) {
    return ctx.app.pluginDataDir + "/" + LIVE_USAGE_CACHE_FILE
  }

  function currentTimeMs(ctx) {
    var parsed = ctx && ctx.util && typeof ctx.util.parseDateMs === "function"
      ? ctx.util.parseDateMs(ctx.nowIso)
      : null
    return typeof parsed === "number" && isFinite(parsed) ? parsed : Date.now()
  }

  function latestResetTimeIso(ctx, lines) {
    var latestMs = null
    for (var i = 0; i < lines.length; i++) {
      var resetsAt = parseResetTime(lines[i] && lines[i].resetsAt)
      var resetMs = resetsAt && ctx.util && typeof ctx.util.parseDateMs === "function"
        ? ctx.util.parseDateMs(resetsAt)
        : null
      if (typeof resetMs !== "number" || !isFinite(resetMs)) continue
      if (latestMs === null || resetMs > latestMs) latestMs = resetMs
    }
    return latestMs === null ? null : new Date(latestMs).toISOString()
  }

  function deleteCachedLiveUsage(ctx, reason) {
    try {
      var path = liveUsageCachePath(ctx)
      if (!ctx.host.fs.exists(path)) return
      if (typeof ctx.host.fs.remove === "function") ctx.host.fs.remove(path)
      else ctx.host.fs.writeText(path, "")
      ctx.host.log.warn("deleted cached live Antigravity usage: " + reason)
    } catch (e) {
      ctx.host.log.warn("failed to delete cached live Antigravity usage: " + String(e))
    }
  }

  function cacheLiveUsage(ctx, output) {
    try {
      ctx.host.fs.writeText(liveUsageCachePath(ctx), JSON.stringify({
        plan: typeof output.plan === "string" && output.plan.trim() ? output.plan : null,
        lines: output.lines,
        lastSeenResetAt: latestResetTimeIso(ctx, output.lines),
      }))
    } catch (e) {
      ctx.host.log.warn("failed to cache live Antigravity usage: " + String(e))
    }
  }

  function loadCachedLiveUsage(ctx) {
    try {
      var path = liveUsageCachePath(ctx)
      if (!ctx.host.fs.exists(path)) return null
      var parsed = ctx.util.tryParseJson(ctx.host.fs.readText(path))
      if (!parsed || !Array.isArray(parsed.lines) || parsed.lines.length === 0) return null
      var nowMs = currentTimeMs(ctx)
      var cachedResetMs = typeof ctx.util.parseDateMs === "function"
        ? ctx.util.parseDateMs(parsed.lastSeenResetAt)
        : null
      if (typeof cachedResetMs === "number" && isFinite(cachedResetMs) && cachedResetMs <= nowMs) {
        deleteCachedLiveUsage(ctx, "cached reset window elapsed")
        return null
      }

      var lines = []
      var droppedExpiredLines = false
      for (var i = 0; i < parsed.lines.length; i++) {
        var line = parsed.lines[i]
        if (!line || line.type !== "progress") return null
        if (typeof line.label !== "string" || !line.label.trim()) return null
        if (typeof line.used !== "number" || !isFinite(line.used)) return null
        if (typeof line.limit !== "number" || !isFinite(line.limit) || line.limit <= 0) return null
        if (!line.format || line.format.kind !== "percent") return null
        var resetsAt = parseResetTime(line.resetsAt)
        var resetMs = resetsAt && typeof ctx.util.parseDateMs === "function"
          ? ctx.util.parseDateMs(resetsAt)
          : null
        if (typeof resetMs === "number" && isFinite(resetMs) && resetMs <= nowMs) {
          droppedExpiredLines = true
          continue
        }
        lines.push(ctx.line.progress({
          label: line.label,
          used: line.used,
          limit: line.limit,
          format: { kind: "percent" },
          resetsAt: resetsAt,
          periodDurationMs: typeof line.periodDurationMs === "number" && isFinite(line.periodDurationMs)
            ? line.periodDurationMs
            : QUOTA_PERIOD_MS,
          color: typeof line.color === "string" ? line.color : undefined,
        }))
      }

      if (lines.length === 0) {
        deleteCachedLiveUsage(ctx, "all cached live usage lines expired")
        return null
      }

      var output = {
        plan: typeof parsed.plan === "string" && parsed.plan.trim() ? parsed.plan : null,
        lines: lines,
      }
      if (droppedExpiredLines) cacheLiveUsage(ctx, output)
      return output
    } catch (e) {
      ctx.host.log.warn("failed to read cached live Antigravity usage: " + String(e))
      return null
    }
  }

  function cacheToken(ctx, accessToken, expiresInSeconds) {
    try {
      ctx.host.fs.writeText(ctx.app.pluginDataDir + "/auth.json", JSON.stringify({
        accessToken: accessToken,
        expiresAtMs: Date.now() + (expiresInSeconds || 3600) * 1000,
      }))
    } catch (e) {
      ctx.host.log.warn("failed to cache refreshed token: " + String(e))
    }
  }

  function refreshAccessToken(ctx, refreshTokenValue) {
    if (!refreshTokenValue) return null
    try {
      var resp = ctx.host.http.request({
        method: "POST",
        url: GOOGLE_OAUTH_URL,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        bodyText:
          "client_id=" + encodeURIComponent(GOOGLE_CLIENT_ID) +
          "&client_secret=" + encodeURIComponent(GOOGLE_CLIENT_SECRET) +
          "&refresh_token=" + encodeURIComponent(refreshTokenValue) +
          "&grant_type=refresh_token",
        timeoutMs: 15000,
      })
      if (resp.status < 200 || resp.status >= 300) return null
      var body = ctx.util.tryParseJson(resp.bodyText)
      if (!body || !body.access_token) return null
      cacheToken(ctx, body.access_token, typeof body.expires_in === "number" ? body.expires_in : 3600)
      return {
        accessToken: body.access_token,
        expiresInSeconds: typeof body.expires_in === "number" ? body.expires_in : 3600,
      }
    } catch (e) {
      ctx.host.log.warn("Google OAuth refresh failed: " + String(e))
      return null
    }
  }

  function isCachedTokenUsable(cached) {
    return !!(cached && cached.accessToken && cached.expiresAtMs > Date.now())
  }

  function isProtoAccessTokenUsable(proto) {
    return !!(
      proto &&
      proto.accessToken &&
      (!proto.expirySeconds || proto.expirySeconds > Math.floor(Date.now() / 1000))
    )
  }

  function tryCloudCodeToken(ctx, token, label) {
    if (!token) return null
    var data = requestCloudCode(ctx, token)
    if (data && !data.authFailed) return data
    if (data && data.authFailed) ctx.host.log.warn(label + " rejected by Cloud Code auth")
    else ctx.host.log.warn(label + " did not yield usable Cloud Code data")
    return null
  }

  function resolveCloudCodeData(ctx, cached, dbTokens) {
    var sawAuthFailure = false
    if (cached && cached.accessToken) {
      if (isCachedTokenUsable(cached)) {
        var cachedRawData = requestCloudCode(ctx, cached.accessToken)
        if (cachedRawData && !cachedRawData.authFailed) return cachedRawData
        if (cachedRawData && cachedRawData.authFailed) {
          sawAuthFailure = true
          ctx.host.log.warn("cached Antigravity token rejected by Cloud Code auth")
        } else {
          ctx.host.log.warn("cached Antigravity token did not yield usable Cloud Code data")
        }
      } else {
        ctx.host.log.warn("cached Antigravity token expired; skipping direct Cloud Code attempt")
      }
    }

    if (dbTokens && dbTokens.accessToken) {
      if (isProtoAccessTokenUsable(dbTokens)) {
        var dbData = requestCloudCode(ctx, dbTokens.accessToken)
        if (dbData && !dbData.authFailed) return dbData
        if (dbData && dbData.authFailed) {
          sawAuthFailure = true
          ctx.host.log.warn("DB access token rejected by Cloud Code auth")
        } else {
          ctx.host.log.warn("DB access token did not yield usable Cloud Code data")
        }
      } else {
        ctx.host.log.warn("DB access token expired; skipping direct Cloud Code attempt")
      }
    }

    var triedTokenCount = 0
    if (cached && cached.accessToken && isCachedTokenUsable(cached)) triedTokenCount += 1
    if (dbTokens && dbTokens.accessToken && isProtoAccessTokenUsable(dbTokens)) triedTokenCount += 1

    if (dbTokens && dbTokens.refreshToken && (sawAuthFailure || triedTokenCount === 0)) {
      ctx.host.log.warn("attempting Antigravity refresh-token recovery")
      var refreshed = refreshAccessToken(ctx, dbTokens.refreshToken)
      if (refreshed && refreshed.accessToken) {
        var refreshedData = requestCloudCode(ctx, refreshed.accessToken)
        if (refreshedData && !refreshedData.authFailed) return refreshedData
        if (refreshedData && refreshedData.authFailed) {
          ctx.host.log.warn("refresh succeeded but Cloud Code still rejected the refreshed token")
        } else {
          ctx.host.log.warn("refresh succeeded but refreshed token did not yield usable Cloud Code data")
        }
      } else {
        ctx.host.log.warn("Antigravity refresh-token recovery failed")
      }
    } else if (!(dbTokens && dbTokens.refreshToken)) {
      ctx.host.log.warn("no Antigravity refresh token available for offline recovery")
    }

    return null
  }

  function discoverLs(ctx) {
    return ctx.host.ls.discover({
      processName: lsProcessName(ctx),
      markers: ["antigravity"],
      csrfFlag: "--csrf_token",
      portFlag: "--extension_server_port",
    })
  }

  function lsCandidates(discovery) {
    var candidates = []
    var ports = discovery.ports || []
    for (var i = 0; i < ports.length; i++) {
      candidates.push({ port: ports[i], scheme: "https", kind: "port" })
      candidates.push({ port: ports[i], scheme: "http", kind: "port" })
    }
    if (discovery.extensionPort) {
      candidates.push({ port: discovery.extensionPort, scheme: "http", kind: "extensionPort" })
      candidates.push({ port: discovery.extensionPort, scheme: "https", kind: "extensionPort" })
    }
    return candidates
  }

  function callLs(ctx, port, scheme, csrf, method, body) {
    var resp = ctx.host.http.request({
      method: "POST",
      url: scheme + "://127.0.0.1:" + port + "/" + LS_SERVICE + "/" + method,
      headers: {
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
        "x-codeium-csrf-token": csrf,
      },
      bodyText: JSON.stringify(body || {}),
      timeoutMs: 10000,
      dangerouslyIgnoreTls: scheme === "https",
    })
    if (resp.status < 200 || resp.status >= 300) return null
    return ctx.util.tryParseJson(resp.bodyText)
  }

  function parseFraction(value) {
    if (typeof value !== "number" || !isFinite(value) || value < 0 || value > 1) return undefined
    return value
  }

  function parseResetTime(value) {
    if (typeof value !== "string") return undefined
    var trimmed = value.trim()
    if (!trimmed) return undefined
    return isFinite(Date.parse(trimmed)) ? trimmed : undefined
  }

  function normalizeMatchText(value) {
    return String(value || "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
  }

  function resolveFamily(modelId, label) {
    var id = String(modelId || "").trim().toLowerCase()
    var text = normalizeMatchText(label || modelId)
    if (AUTO_GROUP_GEMINI_IMAGE_ID_SET[id] || AUTO_GROUP_GEMINI_IMAGE_ID_PATTERN.test(id) || AUTO_GROUP_GEMINI_IMAGE_LABEL_PATTERN.test(text)) return "gemini_image"
    if (AUTO_GROUP_GEMINI_PRO_ID_SET[id] || AUTO_GROUP_GEMINI_PRO_ID_PATTERN.test(id) || AUTO_GROUP_GEMINI_PRO_LABEL_PATTERN.test(text)) return "gemini_pro"
    if (AUTO_GROUP_GEMINI_FLASH_ID_SET[id] || AUTO_GROUP_GEMINI_FLASH_ID_PATTERN.test(id) || AUTO_GROUP_GEMINI_FLASH_LABEL_PATTERN.test(text)) return "gemini_flash"
    if (AUTO_GROUP_CLAUDE_ID_SET[id] || id.indexOf("claude-") === 0 || id.indexOf("model_claude") === 0 || text.indexOf("claude ") === 0) return "claude"
    if (text.indexOf("gemini") !== -1 && text.indexOf("image") !== -1) return "gemini_image"
    if (text.indexOf("gemini") !== -1 && text.indexOf("pro") !== -1) return "gemini_pro"
    if (text.indexOf("gemini") !== -1 && text.indexOf("flash") !== -1) return "gemini_flash"
    if (
      text.indexOf("claude") !== -1 ||
      text.indexOf("sonnet") !== -1 ||
      text.indexOf("opus") !== -1 ||
      text.indexOf("haiku") !== -1 ||
      text.indexOf("gpt-oss") !== -1
    ) return "claude"
    return "other"
  }

  function parseLabelOrderFromSorts(sorts, labelField) {
    var map = {}
    if (!sorts || !sorts.length) return map
    var groups = sorts[0] && sorts[0].groups
    if (!groups) return map
    var order = 0
    for (var i = 0; i < groups.length; i++) {
      var labels = groups[i] && groups[i][labelField]
      if (!labels) continue
      for (var j = 0; j < labels.length; j++) {
        var key = String(labels[j] || "")
        if (!key || map[key] !== undefined) continue
        map[key] = order++
      }
    }
    return map
  }

  function parseModelRecords(items, orderMap, orderKey, modelIdKey) {
    var records = []
    for (var i = 0; i < items.length; i++) {
      var item = items[i]
      var label = typeof item.label === "string" ? item.label.trim() : typeof item.displayName === "string" ? item.displayName.trim() : ""
      if (!label) continue
      var modelId = modelIdKey(item, i)
      if (BLACKLISTED_MODEL_IDS[modelId]) continue
      var quotaInfo = item.quotaInfo || {}
      var family = resolveFamily(modelId, label)
      var remainingFraction = parseFraction(quotaInfo.remainingFraction)
      var resetTime = parseResetTime(quotaInfo.resetTime)
      records.push({
        label: label,
        modelId: modelId,
        family: family,
        remainingFraction: remainingFraction,
        resetTime: resetTime,
        order: orderMap[orderKey(item)] !== undefined ? orderMap[orderKey(item)] : i,
      })
    }
    return records
  }

  function chooseFamilyQuota(models) {
    var byFingerprint = {}
    for (var i = 0; i < models.length; i++) {
      var model = models[i]
      if (model.remainingFraction === undefined) continue
      var fingerprint = model.remainingFraction.toFixed(6) + "|" + (model.resetTime || "")
      if (!byFingerprint[fingerprint]) {
        byFingerprint[fingerprint] = {
          count: 0,
          firstOrder: model.order,
          remainingFraction: model.remainingFraction,
          resetTime: model.resetTime,
        }
      }
      byFingerprint[fingerprint].count += 1
      if (model.order < byFingerprint[fingerprint].firstOrder) byFingerprint[fingerprint].firstOrder = model.order
    }
    var best = null
    var keys = Object.keys(byFingerprint)
    for (var j = 0; j < keys.length; j++) {
      var candidate = byFingerprint[keys[j]]
      if (!best || candidate.count > best.count || (candidate.count === best.count && candidate.firstOrder < best.firstOrder)) {
        best = candidate
      }
    }
    return best
  }

  function buildGroupedLines(ctx, models) {
    var byFamily = {}
    for (var i = 0; i < models.length; i++) {
      var model = models[i]
      if (model.remainingFraction === undefined) continue
      if (!byFamily[model.family]) byFamily[model.family] = []
      byFamily[model.family].push(model)
    }

    var groups = []
    var families = Object.keys(byFamily)
    for (var j = 0; j < families.length; j++) {
      var family = families[j]
      var quota = chooseFamilyQuota(byFamily[family])
      if (!quota) continue
      groups.push({
        label: FAMILY_LABELS[family] || FAMILY_LABELS.other,
        remainingFraction: quota.remainingFraction,
        resetTime: quota.resetTime,
        order: quota.firstOrder,
        priority: FAMILY_PRIORITY[family] !== undefined ? FAMILY_PRIORITY[family] : FAMILY_PRIORITY.other,
      })
    }

    var hasClaudeGroup = false
    for (var g = 0; g < groups.length; g++) {
      if (groups[g].label === FAMILY_LABELS.claude) {
        hasClaudeGroup = true
        break
      }
    }
    if (groups.length > 0 && !hasClaudeGroup) {
      var exhaustedClaude = null
      for (var m = 0; m < models.length; m++) {
        var model = models[m]
        if (model.family !== "claude" || model.remainingFraction !== undefined || !model.resetTime) continue
        if (!exhaustedClaude || model.order < exhaustedClaude.order) {
          exhaustedClaude = model
        }
      }
      if (exhaustedClaude) {
        groups.push({
          label: FAMILY_LABELS.claude,
          remainingFraction: 0,
          resetTime: exhaustedClaude.resetTime,
          order: exhaustedClaude.order,
          priority: FAMILY_PRIORITY.claude,
        })
      }
    }

    groups.sort(function (a, b) {
      if (a.order !== b.order) return a.order - b.order
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.label.localeCompare(b.label)
    })

    var lines = []
    for (var k = 0; k < groups.length; k++) {
      lines.push(ctx.line.progress({
        label: groups[k].label,
        used: Math.round((1 - groups[k].remainingFraction) * 100),
        limit: 100,
        format: { kind: "percent" },
        resetsAt: groups[k].resetTime,
        periodDurationMs: QUOTA_PERIOD_MS,
      }))
    }
    return lines
  }

  function hasUsableQuota(models) {
    for (var i = 0; i < models.length; i++) {
      if (models[i].remainingFraction !== undefined) return true
    }
    return false
  }

  function unavailableLines(ctx) {
    return [ctx.line.badge({ label: "Status", text: "Quota unavailable", color: "#a3a3a3" })]
  }

  function parseLsResult(data) {
    var hasUserStatus = !!(data && data.userStatus)
    var container = hasUserStatus ? data.userStatus : data
    if (!container) return { plan: null, models: [] }
    var cascade = hasUserStatus ? (container.cascadeModelConfigData || {}) : container
    var configs = cascade.clientModelConfigs || []
    var orderMap = parseLabelOrderFromSorts(cascade.clientModelSorts || [], "modelLabels")
    var planInfo = hasUserStatus ? ((container.planStatus || {}).planInfo || {}) : {}
    return {
      plan: planInfo.planName || null,
      models: parseModelRecords(
        configs,
        orderMap,
        function (item) { return item.label },
        function (item) { return item.modelOrAlias && item.modelOrAlias.model ? item.modelOrAlias.model : String(item.label || "") }
      ),
    }
  }

  function resolveCloudCodeOrderedKeys(data) {
    var models = data && data.models
    if (!models || typeof models !== "object") return []
    var order = []
    var added = {}
    var sorts = data.agentModelSorts || []
    for (var i = 0; i < sorts.length; i++) {
      var groups = sorts[i] && sorts[i].groups
      if (!groups) continue
      for (var j = 0; j < groups.length; j++) {
        var modelIds = groups[j] && groups[j].modelIds
        if (!modelIds) continue
        for (var k = 0; k < modelIds.length; k++) {
          var modelKey = modelIds[k]
          if (!models[modelKey] || added[modelKey]) continue
          added[modelKey] = true
          order.push(modelKey)
        }
      }
    }
    if (models[EXTRA_IMAGE_MODEL_KEY] && !added[EXTRA_IMAGE_MODEL_KEY]) {
      added[EXTRA_IMAGE_MODEL_KEY] = true
      order.push(EXTRA_IMAGE_MODEL_KEY)
    }
    var keys = Object.keys(models)
    for (var x = 0; x < keys.length; x++) {
      var key = keys[x]
      if (added[key]) continue
      if (models[key] && models[key].model === EXTRA_IMAGE_MODEL_ID) {
        added[key] = true
        order.push(key)
      }
    }
    for (var y = 0; y < keys.length; y++) {
      if (!added[keys[y]]) order.push(keys[y])
    }
    return order
  }

  function parseCloudCodeModels(data) {
    var models = data && data.models
    if (!models || typeof models !== "object") return []
    var orderedKeys = resolveCloudCodeOrderedKeys(data)
    var orderedItems = []
    for (var i = 0; i < orderedKeys.length; i++) {
      var key = orderedKeys[i]
      var item = models[key]
      if (!item || typeof item !== "object" || item.isInternal) continue
      if (typeof item.displayName !== "string" || !item.displayName.trim()) continue
      orderedItems.push({
        key: key,
        displayName: item.displayName,
        model: item.model || key,
        quotaInfo: item.quotaInfo || {},
      })
    }
    return parseModelRecords(
      orderedItems,
      {},
      function (item) { return item.key },
      function (item) { return item.model }
    )
  }

  function probeLs(ctx) {
    var discovery = discoverLs(ctx)
    if (!discovery) return null

    var metadata = { ideName: "antigravity", extensionName: "antigravity", ideVersion: "unknown", locale: "en" }

    var candidates = lsCandidates(discovery)
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i]
      var data = null
      try {
        data = callLs(ctx, candidate.port, candidate.scheme, discovery.csrf, "GetUserStatus", { metadata: metadata })
      } catch (e) {
        ctx.host.log.warn(
          "GetUserStatus threw on " +
            candidate.kind +
            " " +
            candidate.scheme +
            "://" +
            candidate.port +
            ": " +
            String(e)
        )
      }
      if (!(data && data.userStatus)) {
        try {
          data = callLs(ctx, candidate.port, candidate.scheme, discovery.csrf, "GetCommandModelConfigs", { metadata: metadata })
        } catch (e) {
          ctx.host.log.warn(
            "GetCommandModelConfigs threw on " +
              candidate.kind +
              " " +
              candidate.scheme +
              "://" +
              candidate.port +
              ": " +
              String(e)
          )
        }
      }
      if (!data) continue
      var parsed = parseLsResult(data)
      if (parsed.models.length > 0 || parsed.plan) return parsed
    }
    return null
  }

  function requestCloudCode(ctx, token) {
    for (var i = 0; i < CLOUD_CODE_URLS.length; i++) {
      try {
        var resp = ctx.host.http.request({
          method: "POST",
          url: CLOUD_CODE_URLS[i] + FETCH_MODELS_PATH,
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "User-Agent": "antigravity" },
          bodyText: "{}",
          timeoutMs: 15000,
        })
        if (ctx.util.isAuthStatus(resp.status)) return { authFailed: true }
        if (resp.status >= 200 && resp.status < 300) return ctx.util.tryParseJson(resp.bodyText)
      } catch (e) {
        ctx.host.log.warn("Cloud Code request failed (" + CLOUD_CODE_URLS[i] + "): " + String(e))
      }
    }
    return null
  }

  function probe(ctx) {
    var dbTokens = loadOAuthTokens(ctx)
    var ls = probeLs(ctx)
    if (ls && hasUsableQuota(ls.models)) {
      var liveOutput = { plan: ls.plan, lines: buildGroupedLines(ctx, ls.models) }
      cacheLiveUsage(ctx, liveOutput)
      return liveOutput
    }

    if (!ls) {
      var cachedLive = loadCachedLiveUsage(ctx)
      if (cachedLive) {
        ctx.host.log.warn("using cached live Antigravity usage because the language server is not running")
        return cachedLive
      }
    }

    var cached = loadCachedToken(ctx)
    var ccData = resolveCloudCodeData(ctx, cached, dbTokens)
    if (ccData && !ccData.authFailed) {
      var ccModels = parseCloudCodeModels(ccData)
      if (hasUsableQuota(ccModels)) return { plan: ls ? ls.plan : null, lines: buildGroupedLines(ctx, ccModels) }
      return { plan: ls ? ls.plan : null, lines: unavailableLines(ctx) }
    }

    if (ls && (ls.models.length > 0 || ls.plan)) return { plan: ls.plan, lines: unavailableLines(ctx) }
    throw "Start Antigravity and try again."
  }

  globalThis.__openusage_plugin = { id: "antigravity", probe: probe }
})()
