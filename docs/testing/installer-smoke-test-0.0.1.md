# Windows Installer Smoke Test: v0.0.1

Checked: 2026-08-20T14:03:00+02:00  
Platform: Windows  
Result: **PUBLISHED; BASIC WINDOWS SMOKE PASSED**

## Release Input

- Expected tag: `v0.0.1`
- Final source commit: `02889b1e8168588bce0f042952670f040c323b92`
- Local installer: `src-tauri/target/release/bundle/nsis/UsageBar_0.0.1_x64-setup.exe`
- Local installer size: `8,535,741` bytes
- Local installer SHA-256: `4E73F868A600403105D719B1E728A8E530EE77A58CBC8C731A3D719F6DCB4FD5`
- Local installer signature: `NotSigned` (`Get-AuthenticodeSignature`)
- GitHub release URL: https://github.com/luisleineweber/usagebar/releases/tag/v0.0.1
- GitHub installer: `UsageBar_0.0.1_x64-setup.exe`
- GitHub installer size: `8,578,892` bytes
- GitHub installer SHA-256: `86ed8f298ede54f75eddafa97c97bc32b5c7b7e73b4f0793bf71fb4bb3779795`
- GitHub installer signature: `NotSigned` (`Get-AuthenticodeSignature`)

The local v0.0.1 release preflight, NSIS build, install, launch, and CLI checks passed. The GitHub workflow published the final installer, `latest.json`, and the updater signature asset.

## Signing Readiness

- Tauri updater signing key: Configured in GitHub
- Tauri updater signing password: Configured in GitHub
- Windows Authenticode certificate: Not configured in GitHub or locally

The stable updater uses signed Tauri metadata. The Windows installer remains unsigned under the current release policy. Windows can show `Unknown publisher` or a SmartScreen warning.

## Artifact Checks

- [x] Local NSIS installer exists with the exact size and SHA-256 above.
- [x] Local installer signature state is recorded as `NotSigned`.
- [x] Record the final source commit and GitHub release URL.
- [x] Verify the GitHub installer SHA-256 and size.
- [x] Verify `latest.json` and updater signature assets exist.

## Installer Checks

- [x] Silent install completed with exit code 0 into a workspace-local smoke directory.
- [x] Installed `usagebar.exe` stayed running for five seconds and had no console window.
- [x] Installed `usagebar-cli.exe --version` returned `usagebar-cli 0.0.1` with exit code 0.
- [x] The smoke app process stopped cleanly.
- [ ] Confirm UsageBar starts from the Windows Start menu.
- [ ] Refresh a supported provider from a fresh setup.
- [ ] Confirm invalid credentials show a clear error without a crash.
- [ ] Test the signed updater path against a newer release.
- [ ] Confirm uninstall removes the app and its `PATH` entry.
- [ ] Confirm uninstall keeps user data unless the user removes it.

## Remaining Follow-up

Complete the remaining extended Windows checks against the published installer: Start menu launch, fresh provider setup, invalid credentials, updater restart, uninstall, and user-data retention.
