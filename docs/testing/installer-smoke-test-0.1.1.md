# Windows Installer Smoke Test: v0.1.1

Checked: 2026-08-20T16:15:00+02:00  
Platform: Windows  
Result: **LOCAL BASIC WINDOWS SMOKE PASSED; PENDING PUBLISH**

## Release Input

- Expected tag: `v0.1.1`
- Source commit: `0d7b31eb`
- Local installer: `src-tauri/target/release/bundle/nsis/UsageBar_0.1.1_x64-setup.exe`
- Local installer size: `8,534,920` bytes
- Local installer SHA-256: `1642F46F2A350657D494657A9A55E8E635E7105008366EF230CF2F63BC5F1A75`
- Local installer signature: `NotSigned` (`Get-AuthenticodeSignature`)
- GitHub release URL: pending publish
- GitHub installer: pending publish

The local v0.1.1 release preflight, NSIS build, silent install, launch, and CLI checks passed.

## Signing Readiness

- Tauri updater signing key: Configured in GitHub
- Tauri updater signing password: Configured in GitHub
- Windows Authenticode certificate: Not configured in GitHub or locally

The stable updater uses signed Tauri metadata. The Windows installer remains unsigned under the current release policy. Windows can show `Unknown publisher` or a SmartScreen warning.

## Artifact Checks

- [x] Local NSIS installer exists with the exact size and SHA-256 above.
- [x] Local installer signature state is recorded as `NotSigned`.
- [x] Source commit is recorded.
- [ ] Verify the GitHub installer SHA-256 and size.
- [ ] Verify `latest.json` and updater signature assets exist.

## Installer Checks

- [x] Silent install completed with exit code 0 into `D:\UsageBar\usagebar-smoke-0.1.1`.
- [x] Installed `usagebar.exe` stayed running for five seconds and had no console window.
- [x] Installed `usagebar-cli.exe --version` returned `usagebar-cli 0.1.1` with exit code 0.
- [x] The smoke app process stopped cleanly.
- [ ] Confirm UsageBar starts from the Windows Start menu.
- [ ] Refresh a supported provider from a fresh setup.
- [ ] Confirm invalid credentials show a clear error without a crash.
- [ ] Test the signed updater path against a newer release.
- [ ] Confirm uninstall removes the app and its `PATH` entry.
- [ ] Confirm uninstall keeps user data unless the user removes it.

## Remaining Follow-up

Complete the GitHub artifact checks and the remaining extended Windows checks against the published installer.
