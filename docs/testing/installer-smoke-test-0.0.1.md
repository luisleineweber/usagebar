# Windows Installer Smoke Test: v0.0.1

Checked: 2026-08-20T14:03:00+02:00  
Platform: Windows  
Result: **LOCAL CANDIDATE PASSED; GITHUB RELEASE VERIFICATION PENDING**

## Release Input

- Expected tag: `v0.0.1`
- Final source commit: The release commit will be recorded after commit creation.
- Local installer: `src-tauri/target/release/bundle/nsis/UsageBar_0.0.1_x64-setup.exe`
- Local installer size: `8,535,741` bytes
- Local installer SHA-256: `4E73F868A600403105D719B1E728A8E530EE77A58CBC8C731A3D719F6DCB4FD5`
- Local installer signature: `NotSigned` (`Get-AuthenticodeSignature`)
- GitHub release URL: Pending publication

The local v0.0.1 release preflight, NSIS build, install, launch, and CLI checks passed. The GitHub workflow must still publish and verify the final release asset.

## Signing Readiness

- Tauri updater signing key: Configured in GitHub
- Tauri updater signing password: Configured in GitHub
- Windows Authenticode certificate: Not configured in GitHub or locally

The stable updater uses signed Tauri metadata. The Windows installer remains unsigned under the current release policy. Windows can show `Unknown publisher` or a SmartScreen warning.

## Artifact Checks

- [x] Local NSIS installer exists with the exact size and SHA-256 above.
- [x] Local installer signature state is recorded as `NotSigned`.
- [ ] Record the final source commit and GitHub release URL.
- [ ] Verify the GitHub installer SHA-256 and size.
- [ ] Verify `latest.json` and updater signature assets exist.

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

## Required Follow-up

After publication, record the final source commit, release URL, and GitHub asset identity. Then complete the remaining Windows checks against that exact installer.
