(function () {
  const PROVIDER_ID = "opencode-go";
  const BASE_URL = "https://opencode.ai";
  const SERVER_URL = BASE_URL + "/_server";
  const WORKSPACES_SERVER_ID = "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f";
  const SUBSCRIPTION_SERVER_ID = "7abeebee372f304e050aaaf92be863f4a86490e382f8c79db68fd94040d691b4";
  const COOKIE_HEADER_SERVICE = "OpenCode Cookie Header";
  const AUTH_PATH = "~/.local/share/opencode/auth.json";
  const DB_PATH = "~/.local/share/opencode/opencode.db";
  const AUTH_ENTRY_KEYS = ["opencode-go", "opencode"];
  const HISTORY_PROVIDER_IDS = ["opencode-go", "opencode"];
  const HISTORY_PROVIDER_SQL = HISTORY_PROVIDER_IDS.map((providerId) =>
    "'" + providerId.replace(/'/g, "''") + "'"
  ).join(", ");
  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const LIMITS = {
    session: 12,
    weekly: 30,
    monthly: 60,
  };
  const FREE_LIMITS = {
    sessionRequests: 200,
  };

  const HISTORY_EXISTS_SQL = `
    SELECT 1 AS present
    FROM message
    WHERE json_valid(data)
      AND json_extract(data, '$.providerID') IN (${HISTORY_PROVIDER_SQL})
      AND json_extract(data, '$.role') = 'assistant'
      AND json_type(data, '$.cost') IN ('integer', 'real')
    LIMIT 1
  `;

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
  `;

  function readNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function readNowMs() {
    return Date.now();
  }

  function randomInstanceId() {
    return "server-fn:" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function readEnv(ctx, name) {
    if (!ctx.host.env || typeof ctx.host.env.get !== "function") return null;
    try {
      const value = ctx.host.env.get(name);
      if (typeof value !== "string") return null;
      return value.trim() || null;
    } catch {
      return null;
    }
  }

  function readProviderConfig(ctx, key) {
    if (!ctx.host.providerConfig || typeof ctx.host.providerConfig.get !== "function") return null;
    try {
      const value = ctx.host.providerConfig.get(key);
      if (typeof value !== "string") return null;
      return value.trim() || null;
    } catch {
      return null;
    }
  }

  function readProviderSecret(ctx, key) {
    if (!ctx.host.providerSecrets || typeof ctx.host.providerSecrets.read !== "function") return null;
    try {
      const value = ctx.host.providerSecrets.read(key);
      if (typeof value !== "string") return null;
      return value.trim() || null;
    } catch {
      return null;
    }
  }

  function readZenCookieHeader(ctx) {
    const envValue = readEnv(ctx, "OPENCODE_COOKIE_HEADER");
    if (envValue) return envValue;

    const source = readProviderConfig(ctx, "source") || "manual";
    if (source === "auto") return null;

    const providerSecret = readProviderSecret(ctx, "cookieHeader");
    if (providerSecret) return providerSecret;

    if (ctx.host.keychain && typeof ctx.host.keychain.readGenericPassword === "function") {
      try {
        const stored = ctx.host.keychain.readGenericPassword(COOKIE_HEADER_SERVICE);
        if (typeof stored === "string" && stored.trim()) return stored.trim();
      } catch {}
    }
    return null;
  }

  function normalizeWorkspaceId(raw) {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (/^wrk_[A-Za-z0-9]+$/.test(trimmed)) return trimmed;
    const direct = trimmed.match(/wrk_[A-Za-z0-9]+/);
    return direct ? direct[0] : null;
  }

  function requestServer(ctx, opts) {
    const request = {
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
    };
    if (opts.method !== "GET") {
      request.headers["Content-Type"] = "application/json";
      request.bodyText = JSON.stringify(opts.args || []);
    }
    const response = ctx.host.http.request(request);
    if (response.status === 401 || response.status === 403) {
      throw "OpenCode Zen session cookie is invalid or expired.";
    }
    if (response.status < 200 || response.status >= 300) {
      throw "OpenCode Zen request failed (HTTP " + response.status + ").";
    }
    return response.bodyText;
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
    });
    if (response.status === 401 || response.status === 403) {
      throw "OpenCode Zen session cookie is invalid or expired.";
    }
    if (response.status < 200 || response.status >= 300) {
      throw "OpenCode Zen billing page request failed (HTTP " + response.status + ").";
    }
    return response.bodyText;
  }

  function collectWorkspaceIds(value, out) {
    if (!value) return;
    if (typeof value === "string") {
      const match = normalizeWorkspaceId(value);
      if (match && out.indexOf(match) === -1) out.push(match);
      return;
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) collectWorkspaceIds(value[i], out);
      return;
    }
    if (typeof value === "object") {
      const keys = Object.keys(value);
      for (let i = 0; i < keys.length; i += 1) collectWorkspaceIds(value[keys[i]], out);
    }
  }

  function parseWorkspaceIds(ctx, text) {
    const ids = [];
    const regex = /id\s*:\s*"(wrk_[^"]+)"/g;
    let match;
    while ((match = regex.exec(text))) {
      if (ids.indexOf(match[1]) === -1) ids.push(match[1]);
    }
    if (ids.length > 0) return ids;
    const parsed = ctx.util.tryParseJson(text);
    if (parsed) collectWorkspaceIds(parsed, ids);
    return ids;
  }

  function resolveWorkspaceId(ctx, cookieHeader) {
    const override =
      normalizeWorkspaceId(readEnv(ctx, "OPENCODE_WORKSPACE_ID")) ||
      normalizeWorkspaceId(readProviderConfig(ctx, "workspaceId"));
    if (override) return override;

    const first = requestServer(ctx, {
      method: "GET",
      serverId: WORKSPACES_SERVER_ID,
      args: null,
      cookieHeader,
      referer: BASE_URL,
    });
    let ids = parseWorkspaceIds(ctx, first);
    if (ids.length > 0) return ids[0];

    const fallback = requestServer(ctx, {
      method: "POST",
      serverId: WORKSPACES_SERVER_ID,
      args: [],
      cookieHeader,
      referer: BASE_URL,
    });
    ids = parseWorkspaceIds(ctx, fallback);
    if (ids.length > 0) return ids[0];
    throw "OpenCode Zen workspace not found. Set OPENCODE_WORKSPACE_ID or Workspace ID.";
  }

  function readCurrencyNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return null;
    const cleaned = value.trim().replace(/[$,\s]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function keyLooksLikeBalance(key) {
    const lower = String(key || "").toLowerCase();
    if (lower.indexOf("balance") !== -1) return true;
    if (lower.indexOf("credit") !== -1 && lower.indexOf("card") === -1) return true;
    if (lower.indexOf("guthaben") !== -1) return true;
    return false;
  }

  function normalizeBalanceFromKey(key, value) {
    const number = readCurrencyNumber(value);
    if (number === null) return null;
    const lower = String(key || "").toLowerCase();
    if (
      lower.indexOf("cent") !== -1 ||
      lower.indexOf("cents") !== -1 ||
      lower.indexOf("minor") !== -1
    ) {
      return number / 100;
    }
    return number;
  }

  function findBalanceValue(value, path, depth) {
    if (depth > 6 || value === null || value === undefined) return null;

    if (typeof value !== "object") {
      return keyLooksLikeBalance(path[path.length - 1])
        ? normalizeBalanceFromKey(path[path.length - 1], value)
        : null;
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        const fromArray = findBalanceValue(value[i], path, depth + 1);
        if (fromArray !== null) return fromArray;
      }
      return null;
    }

    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (!keyLooksLikeBalance(key)) continue;
      const direct = normalizeBalanceFromKey(key, value[key]);
      if (direct !== null) return direct;
      if (value[key] && typeof value[key] === "object") {
        const nestedBalance = findBalanceValue(value[key], path.concat(key), depth + 1);
        if (nestedBalance !== null) return nestedBalance;
      }
    }

    for (let i = 0; i < keys.length; i += 1) {
      const found = findBalanceValue(value[keys[i]], path.concat(keys[i]), depth + 1);
      if (found !== null) return found;
    }

    return null;
  }

  function formatDollars(value) {
    const rounded = Math.round(value * 100) / 100;
    return "$" + rounded.toFixed(2);
  }

  function readZenBalance(ctx, text) {
    const parsed = ctx.util.tryParseJson(text);
    let balance = parsed ? findBalanceValue(parsed, [], 0) : null;

    if (balance === null) {
      const balanceMatch = String(text).match(
        /(?:currentBalance|balance|creditBalance|credits|guthaben)\s*[:=]\s*["']?\$?([0-9]+(?:[,.][0-9]+)?)/i,
      );
      if (balanceMatch) balance = readCurrencyNumber(balanceMatch[1].replace(",", "."));
    }

    if (balance === null) {
      const centsMatch = String(text).match(
        /(?:balanceCents|creditCents|balanceMinor|creditMinor)\s*[:=]\s*["']?([0-9]+)/i,
      );
      if (centsMatch) balance = Number(centsMatch[1]) / 100;
    }

    return balance;
  }

  function loadZenBalanceLine(ctx) {
    const cookieHeader = readZenCookieHeader(ctx);
    if (!cookieHeader) return null;

    const workspaceId = resolveWorkspaceId(ctx, cookieHeader);
    const referer = BASE_URL + "/workspace/" + workspaceId + "/billing";
    const text = requestServer(ctx, {
      method: "GET",
      serverId: SUBSCRIPTION_SERVER_ID,
      args: [workspaceId],
      cookieHeader,
      referer,
    });

    let balance = String(text).trim() === "null" ? null : readZenBalance(ctx, text);
    if (balance === null) {
      balance = readZenBalance(ctx, requestBillingPage(ctx, { workspaceId, cookieHeader }));
    }
    if (balance === null) throw "OpenCode Zen balance was not found in billing data.";

    return ctx.line.text({
      label: "Zen balance",
      value: formatDollars(balance),
      subtitle: "OpenCode Zen pay-as-you-go balance",
    });
  }

  function appendZenBalanceLine(ctx, lines) {
    try {
      const line = loadZenBalanceLine(ctx);
      return line ? lines.concat(line) : lines;
    } catch (e) {
      if (ctx.host.log && typeof ctx.host.log.warn === "function") {
        ctx.host.log.warn("opencode-go zen balance read failed: " + String(e));
      }
      return lines;
    }
  }

  function clampPercent(used, limit) {
    if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0)
      return 0;
    const percent = (used / limit) * 100;
    if (!Number.isFinite(percent)) return 0;
    return Math.round(Math.max(0, Math.min(100, percent)) * 10) / 10;
  }

  function toIso(ms) {
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString();
  }

  function startOfUtcWeek(nowMs) {
    const date = new Date(nowMs);
    const offset = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - offset);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime();
  }

  function startOfUtcMonth(nowMs) {
    const date = new Date(nowMs);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0);
  }

  function startOfNextUtcMonth(nowMs) {
    const date = new Date(nowMs);
    return Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      1,
      0,
      0,
      0,
      0,
    );
  }

  function shiftMonth(year, month, delta) {
    const total = year * 12 + month + delta;
    return [Math.floor(total / 12), ((total % 12) + 12) % 12];
  }

  function anchorMonth(year, month, anchorDate) {
    const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return Date.UTC(
      year,
      month,
      Math.min(anchorDate.getUTCDate(), maxDay),
      anchorDate.getUTCHours(),
      anchorDate.getUTCMinutes(),
      anchorDate.getUTCSeconds(),
      anchorDate.getUTCMilliseconds(),
    );
  }

  function anchoredMonthBounds(nowMs, anchorMs) {
    if (!Number.isFinite(anchorMs)) {
      const startMs = startOfUtcMonth(nowMs);
      return { startMs, endMs: startOfNextUtcMonth(nowMs) };
    }

    const nowDate = new Date(nowMs);
    const anchorDate = new Date(anchorMs);
    let year = nowDate.getUTCFullYear();
    let month = nowDate.getUTCMonth();
    let startMs = anchorMonth(year, month, anchorDate);

    if (startMs > nowMs) {
      const previous = shiftMonth(year, month, -1);
      year = previous[0];
      month = previous[1];
      startMs = anchorMonth(year, month, anchorDate);
    }

    const next = shiftMonth(year, month, 1);
    return {
      startMs,
      endMs: anchorMonth(next[0], next[1], anchorDate),
    };
  }

  function sumRange(rows, startMs, endMs) {
    let total = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.createdMs < startMs || row.createdMs >= endMs) continue;
      total += row.cost;
    }
    return Math.round(total * 10000) / 10000;
  }

  function countRange(rows, startMs, endMs) {
    let total = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.createdMs < startMs || row.createdMs >= endMs) continue;
      total += 1;
    }
    return total;
  }

  function isFreeModel(modelId) {
    if (typeof modelId !== "string") return false;
    const normalized = modelId.toLowerCase();
    return normalized === "big-pickle" ||
      normalized.indexOf("-free") !== -1 ||
      normalized.indexOf(":free") !== -1 ||
      normalized.indexOf("free") !== -1;
  }

  function isFreeOnlyUsage(rows) {
    if (!rows.length) return false;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.cost !== 0) return false;
      if (!isFreeModel(row.modelId)) return false;
    }
    return true;
  }

  function nextRollingReset(rows, nowMs) {
    const startMs = nowMs - FIVE_HOURS_MS;
    let oldest = null;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.createdMs < startMs || row.createdMs >= nowMs) continue;
      if (oldest === null || row.createdMs < oldest) oldest = row.createdMs;
    }
    return toIso((oldest === null ? nowMs : oldest) + FIVE_HOURS_MS);
  }

  function queryRows(ctx, sql) {
    try {
      const raw = ctx.host.sqlite.query(DB_PATH, sql);
      const rows = Array.isArray(raw) ? raw : ctx.util.tryParseJson(raw);
      if (!Array.isArray(rows)) {
        ctx.host.log.warn("sqlite query returned non-array result");
        return { ok: false, rows: [] };
      }
      return { ok: true, rows };
    } catch (e) {
      ctx.host.log.warn("sqlite query failed: " + String(e));
      return { ok: false, rows: [] };
    }
  }

  function loadAuthKey(ctx) {
    if (!ctx.host.fs.exists(AUTH_PATH)) return null;

    try {
      const text = ctx.host.fs.readText(AUTH_PATH);
      const parsed = ctx.util.tryParseJson(text);
      if (!parsed || typeof parsed !== "object") {
        ctx.host.log.warn("opencode auth file is not valid json");
        return null;
      }
      for (let i = 0; i < AUTH_ENTRY_KEYS.length; i += 1) {
        const entry = parsed[AUTH_ENTRY_KEYS[i]];
        if (!entry || typeof entry !== "object") continue;
        const key = typeof entry.key === "string" ? entry.key.trim() : "";
        if (key) return key;
      }
      return null;
    } catch (e) {
      ctx.host.log.warn("opencode auth read failed: " + String(e));
      return null;
    }
  }

  function hasHistory(ctx) {
    const result = queryRows(ctx, HISTORY_EXISTS_SQL);
    if (!result.ok) return { ok: false, present: false };
    return { ok: true, present: result.rows.length > 0 };
  }

  function loadHistory(ctx) {
    const result = queryRows(ctx, HISTORY_ROWS_SQL);
    if (!result.ok) return result;

    const rows = [];
    for (let i = 0; i < result.rows.length; i += 1) {
      const row = result.rows[i];
      if (!row || typeof row !== "object") continue;
      const createdMs = readNumber(row.createdMs);
      const cost = readNumber(row.cost);
      const modelId = typeof row.modelId === "string" ? row.modelId : null;
      if (createdMs === null || createdMs <= 0) continue;
      if (cost === null || cost < 0) continue;
      rows.push({ createdMs, modelId, cost });
    }

    return { ok: true, rows };
  }

  function buildProgressLines(ctx, rows, nowMs) {
    const sessionStartMs = nowMs - FIVE_HOURS_MS;
    if (isFreeOnlyUsage(rows)) {
      const sessionRequests = countRange(rows, sessionStartMs, nowMs);
      return [
        ctx.line.progress({
          label: "5h",
          used: sessionRequests,
          limit: FREE_LIMITS.sessionRequests,
          format: { kind: "count", suffix: "requests" },
          resetsAt: nextRollingReset(rows, nowMs),
          periodDurationMs: FIVE_HOURS_MS,
        }),
      ];
    }

    const weeklyStartMs = startOfUtcWeek(nowMs);
    const weeklyEndMs = weeklyStartMs + WEEK_MS;
    let earliestMs = null;
    for (let i = 0; i < rows.length; i += 1) {
      const createdMs = rows[i].createdMs;
      if (!Number.isFinite(createdMs)) continue;
      if (earliestMs === null || createdMs < earliestMs) earliestMs = createdMs;
    }
    const monthBounds = anchoredMonthBounds(nowMs, earliestMs);
    const monthlyStartMs = monthBounds.startMs;
    const monthlyEndMs = monthBounds.endMs;

    const sessionCost = sumRange(rows, sessionStartMs, nowMs);
    const weeklyCost = sumRange(rows, weeklyStartMs, weeklyEndMs);
    const monthlyCost = sumRange(rows, monthlyStartMs, monthlyEndMs);

    return [
      ctx.line.progress({
        label: "5h",
        used: clampPercent(sessionCost, LIMITS.session),
        limit: 100,
        format: { kind: "percent" },
        resetsAt: nextRollingReset(rows, nowMs),
        periodDurationMs: FIVE_HOURS_MS,
      }),
      ctx.line.progress({
        label: "Weekly",
        used: clampPercent(weeklyCost, LIMITS.weekly),
        limit: 100,
        format: { kind: "percent" },
        resetsAt: toIso(weeklyEndMs),
        periodDurationMs: WEEK_MS,
      }),
      ctx.line.progress({
        label: "Monthly",
        used: clampPercent(monthlyCost, LIMITS.monthly),
        limit: 100,
        format: { kind: "percent" },
        resetsAt: toIso(monthlyEndMs),
        periodDurationMs: monthlyEndMs - monthlyStartMs,
      }),
    ];
  }

  function buildSoftEmptyLines(ctx) {
    return [
      ctx.line.badge({
        label: "Status",
        text: "No Go usage data",
        color: "#a3a3a3",
      }),
    ];
  }

  function buildNotSubscribedLines(ctx) {
    return [
      ctx.line.badge({
        label: "Status",
        text: "No Go subscription usage",
        color: "#a3a3a3",
        subtitle: "Zen auth exists, but no local Go usage was found.",
      }),
    ];
  }

  function probe(ctx) {
    const authKey = loadAuthKey(ctx);
    const history = hasHistory(ctx);
    const detected = !!authKey || (history.ok && history.present);

    if (!detected) {
      throw "OpenCode Go not detected. Log in with OpenCode Go or use it locally first.";
    }

    if (!history.ok) {
      return { plan: "Go", lines: appendZenBalanceLine(ctx, buildSoftEmptyLines(ctx)) };
    }

    if (!history.present) {
      return { plan: "Go", lines: appendZenBalanceLine(ctx, buildNotSubscribedLines(ctx)) };
    }

    const rowsResult = loadHistory(ctx);
    if (!rowsResult.ok) {
      return { plan: "Go", lines: appendZenBalanceLine(ctx, buildSoftEmptyLines(ctx)) };
    }

    return {
      plan: isFreeOnlyUsage(rowsResult.rows) ? "Free" : "Go",
      lines: appendZenBalanceLine(ctx, buildProgressLines(ctx, rowsResult.rows, readNowMs())),
    };
  }

  globalThis.__openusage_plugin = { id: PROVIDER_ID, probe };
})();
