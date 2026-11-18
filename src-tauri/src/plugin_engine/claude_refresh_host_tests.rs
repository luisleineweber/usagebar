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
            else { assert!(result.unwrap().contains("rotated")); }
        });
    }
    assert_eq!(requests.load(Ordering::SeqCst), 1);
}
