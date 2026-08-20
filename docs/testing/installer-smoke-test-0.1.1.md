# Windows Installer Smoke Test: v0.1.1

Checked: 2026-08-20T16:35:00+02:00
Platform: Windows
Result: **PUBLISHED; BASIC WINDOWS SMOKE PASSED**

## Release Input

- Expected tag: `v0.1.1`
- Final source commit: `b232542eae03d8a6ad27c33eb541ea1518bab97e`
- Local installer: `src-tauri/target/release/bundle/nsis/UsageBar_0.1.1_x64-setup.exe`
- Local installer size: `8,534,920` bytes
- Local installer SHA-256: `1642F46F2A350657D494657A9A55E8E635E7105008366EF230CF2F63BC5F1A75`
- Local installer signature: `NotSigned` (`Get-AuthenticodeSignature`)
- GitHub release URL: https://github.com/luisleineweber/usagebar/releases/tag/v0.1.1
- GitHub installer: `UsageBar_0.1.1_x64-setup.exe`
- GitHub installer size: `8,580,163` bytes
- GitHub installer SHA-256: `8D56297CA6F26E6F5D71EAF5B2C996DD152FF17E5D3BFE6A8D3DB454E08BC3D`
- GitHub installer signature: `NotSigned` (`Get-AuthenticodeSignature`)
- GitHub updater manifest: `latest.json`, `1,279` bytes, SHA-256 `F003EC730BABE4066321E895FFBF2DB9D48483804B14A1EF98F5C3FA7980E786`
- GitHub updater signature asset: `UsageBar_0.1.1_x64-setup.exe.sig`, `420` bytes, SHA-256 `6986523A52EE8D5482619E1B8354BB375A33DF3EECFFF3B910C48A5510D7E21`

The local and GitHub v0.1.1 release preflight, NSIS build, silent install, launch, and CLI checks passed. The GitHub workflow published the installer, `latest.json`, and updater signature asset.

## Signing Readiness

- Tauri updater signing key: Configured in GitHub
- Tauri updater signing password: Configured in GitHub
- Windows Authenticode certificate: Not configured in GitHub or locally

The stable updater uses signed Tauri metadata. The Windows installer remains unsigned under the current release policy. Windows can show `Unknown publisher` or a SmartScreen warning.

## Artifact Checks

- [x] Local NSIS installer exists with the exact size and SHA-256 above.
- [x] Local installer signature state is recorded as `NotSigned`.
- [x] Source commit is recorded.
- [x] Verify the GitHub installer SHA-256 and size.
- [x] Verify `latest.json` and updater signature assets exist.

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
