# Guided cookie login test

Run this test on Windows with WebView2 installed:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --locked --test guided_cookie_login --jobs 2
```

The test checks Zed, OpenCode Zen, Abacus AI, and Perplexity. Each check runs in a
separate process. It calls the production Tauri login command with the provider's
allowed URLs and creates the production login window.

The cancellation check loads a local page whose URL contains the provider's
success marker. It checks that the page script runs and the window stays open
without sign-in cookies. It then closes the window and checks the cancellation
result. The capture check adds one approved fixture cookie and one unapproved
fixture cookie. It loads the target page and checks that the result contains
only the approved cookie. Each check fails after ten seconds if the native event
loop or cookie read blocks.

The test uses a separate browser profile. It does not read user account cookies
or store credentials. It does not require provider accounts or working remote pages.
The Windows CI job runs the same native test. The test executable uses the
Common Controls v6 manifest required by WebView2.

This test checks the native window and IPC boundary. Frontend tests use mocks.
Neither test proves real account sign-in, provider billing requests, or packaged
installer behavior. Verify those paths separately when changing them.
