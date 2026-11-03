import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const workflowPath = path.join(import.meta.dirname, "..", ".github", "workflows", "publish.yml")
const workflow = readFileSync(workflowPath, "utf8").replace(/\r\n/g, "\n")

function stepBlock(marker) {
  const steps = workflow.split(/\n(?= {6}- )/)
  const step = steps.find((block) => block.includes(marker))
  assert.ok(step, `Missing publish step: ${marker}`)
  return step
}

test("every release may publish an unsigned Windows installer", () => {
  const build = stepBlock("uses: tauri-apps/tauri-action@v0")

  assert.match(build, /\n {10}USAGEBAR_ALLOW_UNSIGNED_WINDOWS_INSTALLER: "1"\n/)
  assert.doesNotMatch(workflow, /USAGEBAR_ALLOW_UNSIGNED_WINDOWS_INSTALLER=1" >> "\$GITHUB_ENV"/)
})

test("every release requires the Tauri updater signing key", () => {
  const verify = stepBlock("name: Verify updater signing key is configured")
  const build = stepBlock("uses: tauri-apps/tauri-action@v0")

  assert.match(verify, /\n {8}if: runner\.os == 'Windows'\n/)
  assert.match(verify, /TAURI_SIGNING_PRIVATE_KEY: \$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY \}\}/)
  assert.match(build, /TAURI_SIGNING_PRIVATE_KEY: \$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY \}\}/)
  assert.doesNotMatch(build, /--no-sign/)
})
