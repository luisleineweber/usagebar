import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { redactDiagnosticText } from "./redaction"

describe("redactDiagnosticText", () => {
  it.each([
    "access_token=private-token-value",
    '{"apiKey":"private-key-value"}',
    "Cookie: session=private-cookie; other=private-other-cookie",
    "cookie=session=private-cookie; other=private-other-cookie",
    "Authorization: Bearer private-bearer-value",
    "Bearer private-bearer-value",
    "eyJhbGciOiJIUzI1NiJ9.privatepayload.privatesignature",
    "sk-private1234567890123456",
    JSON.stringify({ refresh_token: 'private"escaped-value' }),
  ])("removes secrets from %s", (text) => {
    const result = redactDiagnosticText(text)
    expect(result).toContain("[REDACTED]")
    expect(result).not.toContain("private")
  })

  it("covers every sensitive field in the Rust redaction lists", () => {
    const rust = readFileSync("src-tauri/src/plugin_engine/redaction.rs", "utf8")
    const lists = [...rust.matchAll(/let sensitive_(?:params|keys) = \[([\s\S]*?)\];/g)]
    expect(lists).toHaveLength(2)
    for (const list of lists) {
      for (const [, key] of list[1].matchAll(/"([^"]+)"/g)) {
        for (const text of [`{"${key}":"private-value"}`, `${key}=private-value`]) {
          expect(redactDiagnosticText(text), key).not.toContain("private-value")
        }
      }
    }
  })

  it("preserves the diagnostic message", () => {
    const message = "OpenCode Go API key invalid. Log into OpenCode Go again."
    expect(redactDiagnosticText(message)).toBe(message)
  })
})
