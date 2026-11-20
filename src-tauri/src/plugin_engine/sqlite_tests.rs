//! Disposable databases only. These tests never resolve provider or browser paths.
use super::*;
use rquickjs::{Context, Runtime};

fn with_database(test: impl FnOnce(&Connection, &std::path::Path)) {
    let path = std::env::temp_dir().join(format!("usagebar-sqlite-{}.db", uuid::Uuid::new_v4()));
    let connection = Connection::open(&path).unwrap();
    test(&connection, &path);
    // Keep fixture cleanup consistent with the test harness. No user files are used.
    drop(connection);
    std::fs::remove_file(path).unwrap();
}

fn host_query(path: &std::path::Path, sql: &str) -> Result<JsonValue, String> {
    let runtime = Runtime::new().unwrap();
    let context = Context::full(&runtime).unwrap();
    context.with(|ctx| {
        let host = Object::new(ctx.clone()).unwrap();
        inject_sqlite(&ctx, &host, true).unwrap();
        ctx.globals().set("host", host).unwrap();
        ctx.globals()
            .set("path", path.to_string_lossy().as_ref())
            .unwrap();
        ctx.globals().set("sql", sql).unwrap();
        ctx.eval::<String, _>("host.sqlite.query(path, sql)")
            .map(|json| serde_json::from_str(&json).unwrap())
            .map_err(|_| format!("{:?}", ctx.catch()))
    })
}

#[test]
fn sqlite_runtime_values_semicolons_and_batch_writes() {
    with_database(|connection, path| {
        connection
            .execute_batch("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT);")
            .unwrap();
        let runtime = Runtime::new().unwrap();
        let context = Context::full(&runtime).unwrap();
        context.with(|ctx| {
            let host = Object::new(ctx.clone()).unwrap();
            inject_sqlite(&ctx, &host, true).unwrap();
            ctx.globals().set("host", host).unwrap();
            ctx.globals().set("path", path.to_string_lossy().as_ref()).unwrap();
            ctx.eval::<(), _>(r#"host.sqlite.exec(path, "BEGIN; INSERT OR REPLACE INTO ItemTable VALUES ('cursorAuth/accessToken', 'synthetic''token'); INSERT INTO ItemTable VALUES ('second', 'two'); COMMIT;")"#).unwrap();
        });
        assert_eq!(
            host_query(
                path,
                "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken' LIMIT 1;"
            )
            .unwrap(),
            serde_json::json!([{"value":"synthetic'token"}])
        );
        assert_eq!(
            host_query(path, "SELECT count(*) AS count FROM ItemTable;").unwrap(),
            serde_json::json!([{"count":2}])
        );
        assert_eq!(
            host_query(
                path,
                "SELECT NULL AS missing, 0 AS zero, 1.25 AS real, 'text' AS text, x'00ff' AS blob;"
            )
            .unwrap(),
            serde_json::json!([{"missing":null,"zero":0,"real":1.25,"text":"text","blob":"AP8="}])
        );
        assert_eq!(
            host_query(path, "SELECT value FROM ItemTable WHERE key = 'absent';").unwrap(),
            serde_json::json!([])
        );
        assert!(host_query(path, "SELECT 1; SELECT 2;").is_err());
        assert!(host_query(path, "UPDATE ItemTable SET value = 'changed';").is_err());
        assert!(host_query(path, "SELECT * FROM absent;").is_err());
    });
}

#[test]
fn sqlite_runtime_provider_queries() {
    with_database(|connection, path| {
        connection.execute_batch("CREATE TABLE ItemTable (key TEXT, value TEXT); CREATE TABLE auth_kv (key TEXT, value TEXT); CREATE TABLE message (data TEXT, time_created INTEGER);").unwrap();
        for key in [
            "windsurfAuthStatus",
            "antigravityUnifiedStateSync.oauthToken",
            "kiro.kiroAgent",
        ] {
            connection
                .execute("INSERT INTO ItemTable VALUES (?1, 'fixture')", [key])
                .unwrap();
            assert_eq!(
                host_query(
                    path,
                    &format!("SELECT value FROM ItemTable WHERE key = '{key}' LIMIT 1;")
                )
                .unwrap(),
                serde_json::json!([{"value":"fixture"}])
            );
        }
        connection
            .execute(
                "INSERT INTO auth_kv VALUES ('kirocli:social:token', 'fixture')",
                [],
            )
            .unwrap();
        for sql in [
            "SELECT value FROM auth_kv WHERE key = 'kirocli:social:token' LIMIT 1;",
            "SELECT value FROM auth_kv WHERE key LIKE 'kirocli:%:token' ORDER BY key LIMIT 1;",
        ] {
            assert_eq!(
                host_query(path, sql).unwrap(),
                serde_json::json!([{"value":"fixture"}])
            );
        }
        connection.execute("INSERT INTO message VALUES (?1, 1000)", [r#"{"providerID":"opencode","role":"assistant","cost":0.25,"modelID":"fixture","tokens":{"input":10,"output":2,"cache":{"read":3,"write":4},"total":19}}"#]).unwrap();
        for source in [
            include_str!("../../../plugins/opencode/plugin.js"),
            include_str!("../../../plugins/opencode-go/plugin.js"),
        ] {
            // Run the actual SQL templates, with fixed time and provider parameters.
            let templates: Vec<_> = source
                .split('`')
                .skip(1)
                .step_by(2)
                .filter(|sql| sql.trim_start().starts_with("SELECT"))
                .collect();
            assert_eq!(
                templates.len(),
                2,
                "update SQL coverage when callers change"
            );
            for template in templates {
                let sql = template
                    .replace("${HISTORY_PROVIDER_SQL}", "'opencode-go', 'opencode'")
                    .replace("${Math.floor(sinceMs)}", "0")
                    .replace("${Math.floor(untilMs)}", "2000");
                let rows = host_query(path, &sql).unwrap();
                assert_eq!(rows.as_array().unwrap().len(), 1, "{sql}");
                let row = &rows[0];
                if row.get("createdMs").is_some() {
                    assert_eq!(row["createdMs"], 1000);
                    assert_eq!(row["cost"], 0.25);
                    if row.get("inputTokens").is_some() {
                        assert_eq!(row["inputTokens"], 10.0);
                        assert_eq!(row["cacheReadTokens"], 3.0);
                    }
                } else {
                    assert_eq!(row["present"], 1);
                }
            }
        }
    });
}

#[test]
fn sqlite_runtime_browser_cookie_query() {
    with_database(|connection, path| {
        connection.execute_batch("CREATE TABLE cookies (host_key TEXT, name TEXT, value TEXT, encrypted_value BLOB, expires_utc INTEGER); INSERT INTO cookies VALUES ('.claude.ai', 'sessionKey', 'fixture', x'763130', 0), ('other.test', 'sessionKey', 'excluded', x'', 0);").unwrap();
        let read_only = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .unwrap();
        let mut statement = read_only.prepare("SELECT name, value, encrypted_value, expires_utc FROM cookies WHERE (host_key = ?1 OR host_key = ?2) AND name = ?3").unwrap();
        let rows = statement
            .query_map(("claude.ai", ".claude.ai", "sessionKey"), |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Vec<u8>>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        assert_eq!(
            rows,
            vec![("sessionKey".into(), "fixture".into(), b"v10".to_vec(), 0)]
        );
    });
}
