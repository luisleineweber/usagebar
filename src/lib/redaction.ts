// Keep these fields in sync with plugin_engine/redaction.rs. The parity test
// checks both Rust lists. Exported diagnostics remove the whole value.
const sensitiveKeys = [
  "key",
  "api_key",
  "apikey",
  "token",
  "access_token",
  "secret",
  "password",
  "auth",
  "authorization",
  "bearer",
  "credential",
  "user",
  "user_id",
  "userid",
  "account_id",
  "accountid",
  "email",
  "login",
  "name",
  "refresh_token",
  "apiKey",
  "session_token",
  "sessionToken",
  "auth_token",
  "authToken",
  "id_token",
  "idToken",
  "accessToken",
  "refreshToken",
  "userId",
  "accountId",
  "cloudaicompanionProject",
  "analytics_tracking_id",
  "cookie",
  "set-cookie",
]

const fieldPattern = new RegExp(
  `(["']?[\\w-]*(?:${sensitiveKeys.join("|")})[\\w-]*["']?\\s*[:=]\\s*)("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|[^\\s,;&}\\]]+)`,
  "gi"
)

/** Remove credentials and personal fields before exporting diagnostic text. */
export function redactDiagnosticText(text: string): string {
  return (
    text
      // Header values can contain several cookies or an authentication scheme.
      .replace(/\b(?:set-cookie|cookie|authorization)\s*[:=]\s*[^\r\n]+/gi, "[REDACTED]")
      .replace(/\bBearer\s+[A-Za-z0-9._~+/%=-]+/gi, "Bearer [REDACTED]")
      .replace(fieldPattern, "$1[REDACTED]")
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]")
      .replace(/(?:sk-|pk-|api_|key_|secret_)[A-Za-z0-9_-]{12,}/g, "[REDACTED]")
  )
}
