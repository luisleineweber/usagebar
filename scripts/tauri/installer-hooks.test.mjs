import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const hookPath = new URL("../../src-tauri/windows/installer-hooks.nsh", import.meta.url)

test("NSIS preinstall hook removes a UsageBar registry entry with a missing uninstaller", async () => {
  const hook = await readFile(hookPath, "utf8")

  assert.match(hook, /!macro NSIS_HOOK_PREINSTALL/)
  assert.match(hook, /ReadRegStr \$0 HKCU .*Uninstall\\UsageBar.*UninstallString/)
  assert.match(hook, /DeleteRegKey HKCU .*Uninstall\\UsageBar/)
  assert.match(hook, /\$\{IfNot\} \$\{FileExists\} "\$0"/)
})
