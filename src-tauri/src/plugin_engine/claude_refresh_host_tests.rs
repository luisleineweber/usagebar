use super::*;
use rquickjs::{Context, Exception, Function, Object, Runtime};
use std::sync::{
    Mutex,
    atomic::{AtomicUsize, Ordering},
};

#[test]
fn options_redact_expected_access_token() {
    let text =
        super::super::redact_body(r#"{"expectedAccessToken":"synthetic-access-token-value"}"#);
    assert!(!text.contains("synthetic-access-token-value"));
}

#[test]
fn retains_rotation_across_runtimes_after_failed_or_unverified_writes() {
    for discard_write in [false, true] {
        let dir =
            std::env::temp_dir().join(format!("usagebar-refresh-host-{}", uuid::Uuid::new_v4()));
        let initial = serde_json::json!({
            "usagebarCredentialOwner": "usagebar",
            "claudeAiOauth": { "accessToken": "old", "refreshToken": "refresh", "expiresAt": 1 },
            "unrelated": { "keep": true }
        })
        .to_string();
        let stored = Arc::new(Mutex::new(initial));
        let requests = Arc::new(AtomicUsize::new(0));
        let coordinator = Arc::new(Coordinator::default());
        for attempt in 0..2 {
            // The first runtime is destroyed before storage is retried.
            let runtime = Runtime::new().unwrap();
            let context = Context::full(&runtime).unwrap();
            context.with(|ctx| {
                let secrets = Object::new(ctx.clone()).unwrap();
                let reader = Arc::clone(&stored);
                secrets.set("read", Function::new(ctx.clone(), move |key: String| {
                    assert_eq!(key, "account:selected:authJson");
                    reader.lock().unwrap().clone()
                }).unwrap()).unwrap();
                let writer = Arc::clone(&stored);
                secrets.set("write", Function::new(ctx.clone(), move |ctx: rquickjs::Ctx<'_>, key: String, value: String| -> rquickjs::Result<()> {
                    assert_eq!(key, "account:selected:authJson");
                    if attempt == 0 {
                        if discard_write { return Ok(()) }
                        return Err(Exception::throw_message(&ctx, "synthetic storage failure"));
                    }
                    *writer.lock().unwrap() = value;
                    Ok(())
                }).unwrap()).unwrap();
                let counter = Arc::clone(&requests);
                inject_transaction(
                    &ctx, &secrets,
                    Target { data_dir: dir.clone(), secret_key: "account:selected:authJson".into() },
                    &["platform.claude.com".into()], dir.join("refresh.lock"), Arc::clone(&coordinator),
                    move |options, token| {
                        assert_eq!(token, "refresh");
                        assert_eq!(options.client_id, "synthetic-client");
                        counter.fetch_add(1, Ordering::SeqCst);
                        Ok(HttpRespParams { status: 200, headers: Default::default(), body_text: r#"{"access_token":"new","refresh_token":"rotated","expires_in":3600}"#.into() })
                    },
                ).unwrap();
                let refresh: Function = secrets.get("refreshClaudeCredentials").unwrap();
                let options = serde_json::json!({
                    "refreshUrl": "https://platform.claude.com/v1/oauth/token",
                    "clientId": "synthetic-client", "scopes": "synthetic-scope",
                    "expectedAccessToken": "old", "secretKey": "account:wrong:authJson"
                }).to_string();
                let result = refresh.call::<_, String>((options,));
                if attempt == 0 {
                    assert!(result.is_err());
                    let _ = ctx.catch();
                } else {
                    let result: serde_json::Value = serde_json::from_str(&result.unwrap()).unwrap();
                    let document: serde_json::Value = serde_json::from_str(result["credentials"].as_str().unwrap()).unwrap();
                    assert_eq!(document["claudeAiOauth"]["refreshToken"], "rotated");
                    assert_eq!(document["unrelated"]["keep"], true);
                    assert_eq!(*stored.lock().unwrap(), result["credentials"].as_str().unwrap());
                }
            });
        }
        assert_eq!(requests.load(Ordering::SeqCst), 1);
    }
}
