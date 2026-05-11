import { spawnSync } from "node:child_process"

const prettierFiles = [
  ".github/workflows/ci.yml",
  ".prettierrc.json",
  "eslint.config.js",
  "package.json",
  "scripts/check-format.mjs",
]

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  })

  if (result.status !== 0) {
    if (options.capture && result.stderr) {
      process.stderr.write(result.stderr)
    }
    process.exit(result.status ?? 1)
  }

  return result.stdout ?? ""
}

run("bun", ["prettier", "--check", ...prettierFiles])
