use super::super::claude_refresh::{CredentialStore, tests::TestStore};
use super::*;
use rquickjs::{Context, Function, Object, Runtime};
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
#[test]
fn options_redact_expected_access_token() {
    let text =
        super::super::redact_body(r#"{"expectedAccessToken":"synthetic-access-token-value"}"#);
    assert!(!text.contains("synthetic-access-token-value"));
}
#[test]
fn native_recovery_outlives_javascript_and_coordinator() {
    let store = TestStore::new();
    let requests = Arc::new(AtomicUsize::new(0));
    let dir = store.target().data_dir.join("locks");
    for attempt in 0..2 {
        store.fail_commit.store(attempt == 0, Ordering::SeqCst);
        let runtime = Runtime::new().unwrap();
        let context = Context::full(&runtime).unwrap();
        context.with(|ctx| {
            let secrets = Object::new(ctx.clone()).unwrap(); let counter = Arc::clone(&requests);
            inject_transaction(&ctx, &secrets, store.clone(), &["platform.claude.com".into()], dir.clone(), Arc::new(Coordinator::default()), move |_, token| {
                assert_eq!(token, "refresh"); counter.fetch_add(1, Ordering::SeqCst);
                Ok(HttpRespParams { status: 200, headers: Default::default(), body_text: r#"{"access_token":"new","refresh_token":"rotated"}"#.into() })
            }).unwrap();
            let refresh: Function = secrets.get("refreshClaudeCredentials").unwrap();
            let options = serde_json::json!({ "refreshUrl": "https://platform.claude.com/v1/oauth/token", "clientId": "test", "scopes": "test", "expectedAccessToken": "old", "secretKey": "account:wrong:authJson" }).to_string();
            let result = refresh.call::<_, String>((options,));
            if attempt == 0 { assert!(result.is_err()); let _ = ctx.catch(); }
            else {
                let result: serde_json::Value = serde_json::from_str(&result.unwrap()).unwrap();
                assert_eq!(result["credentials"]["claudeAiOauth"]["accessToken"], "new");
                assert!(result["credentials"]["claudeAiOauth"].get("refreshToken").is_none());
                assert!(store.read().unwrap().unwrap().contains("rotated"));
            }
        });
    }
    assert_eq!(requests.load(Ordering::SeqCst), 1);
}

#[test]
fn http_is_rejected_before_any_request() {
    let runtime = Runtime::new().unwrap();
    let context = Context::full(&runtime).unwrap();
    let requests = Arc::new(AtomicUsize::new(0));
    context.with(|ctx| {
        let store = TestStore::new();
        let dir = store.target().data_dir.join("locks");
        let secrets = Object::new(ctx.clone()).unwrap();
        let counter = Arc::clone(&requests);
        inject_transaction(&ctx, &secrets, store, &["platform.claude.com".into()], dir, Arc::new(Coordinator::default()), move |_, _| {
            counter.fetch_add(1, Ordering::SeqCst);
            Ok(HttpRespParams { status: 200, headers: Default::default(), body_text: r#"{"access_token":"new"}"#.into() })
        }).unwrap();
        let refresh: Function = secrets.get("refreshClaudeCredentials").unwrap();
        let options = serde_json::json!({ "refreshUrl": "http://platform.claude.com/v1/oauth/token", "clientId": "test", "scopes": "test", "expectedAccessToken": "old" }).to_string();
        let result = refresh.call::<_, String>((options,));
        if result.is_err() { let _ = ctx.catch(); }
        assert!(result.is_err(), "plain HTTP must be rejected");
    });
    assert_eq!(requests.load(Ordering::SeqCst), 0);
}

#[test]
fn refresh_failure_projects_only_safe_fields() {
    let runtime = Runtime::new().unwrap();
    let context = Context::full(&runtime).unwrap();
    for status in [400, 429] {
        let store = TestStore::new();
        let dir = store.target().data_dir.join("locks");
        context.with(|ctx| {
            let secrets = Object::new(ctx.clone()).unwrap();
            inject_transaction(&ctx, &secrets, store, &["platform.claude.com".into()], dir, Arc::new(Coordinator::default()), move |_, _| {
                Ok(HttpRespParams {
                    status,
                    headers: [("Retry-After".into(), "600".into()), ("X-Private".into(), "synthetic-private-header".into())].into_iter().collect(),
                    body_text: r#"{"error":"synthetic-private-code","error_description":"synthetic-private-description","refresh_token":"synthetic-private-refresh"}"#.into()
                })
            }).unwrap();
            let refresh: Function = secrets.get("refreshClaudeCredentials").unwrap();
            let raw = refresh.call::<_, String>((r#"{"refreshUrl":"https://platform.claude.com/v1/oauth/token","clientId":"test","scopes":"test","expectedAccessToken":"old"}"#,)).unwrap();
            assert!(!raw.contains("synthetic-private"));
            let result: serde_json::Value = serde_json::from_str(&raw).unwrap();
            assert_eq!(result["response"]["status"], status);
            if status == 429 {
                assert_eq!(result["response"]["retryAfterSeconds"], 600);
            } else {
                assert_eq!(result["response"]["errorCode"], "other");
            }
            assert!(result["response"].get("headers").is_none());
            assert!(result["response"].get("bodyText").is_none());
        });
    }
}
