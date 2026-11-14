"""Builds the three exercise stages of chapter 48 from /opt/rs/scratch/shortener:
shortener_a (PATCH), shortener_b (+ last visit), shortener_c (+ expiry). Each is formatted and tested."""
import shutil, subprocess, sys, os
from pathlib import Path

BASE = Path('/opt/rs/scratch')
ENV = dict(os.environ)

def sh(cmd, cwd):
    r = subprocess.run(f". /opt/rs/env.sh && {cmd}", shell=True, cwd=cwd, capture_output=True, text=True, executable="/bin/bash")
    return r.returncode, r.stdout + r.stderr

def stage(src, dst):
    s, d = BASE / src, BASE / dst
    if d.exists():
        shutil.rmtree(d)
    shutil.copytree(s, d, ignore=shutil.ignore_patterns('.git', 'links.db*'))
    return d

def make_rep(root):
    def rep(path, old, new, count=1):
        p = root / path; s = p.read_text()
        assert s.count(old) == count, (str(root), path, old, s.count(old))
        p.write_text(s.replace(old, new))
    return rep

def finish(root):
    code, out = sh("cargo fmt && cargo clippy --all-targets -q 2>&1 | grep -v 'unused dep' ; cargo test -q 2>&1 | grep -E 'test result: .* [1-9][0-9]* passed|FAILED|error|panicked|warning: unused|warning: field'", root)
    print(root.name, "\n" + out.strip())

# =====================================================================  A: PATCH
d = stage('shortener', 'shortener_a'); rep = make_rep(d)
rep('src/store.rs', "    /// Lists links, the most visited first.", '''    /// Changes the address of a link. Returns the changed link, or `None` for an unknown code.
    pub async fn update_url(&self, code: &str, url: &str) -> Result<Option<Link>, sqlx::Error> {
        sqlx::query_as(
            "UPDATE links SET url = ? WHERE code = ?
             RETURNING code, url, hits, created_at",
        )
        .bind(url)
        .bind(code)
        .fetch_optional(&self.pool)
        .await
    }

    /// Lists links, the most visited first.''')
rep('src/routes.rs', """struct NewLink {
    url: String,
    code: Option<String>,
}
""", """struct NewLink {
    url: String,
    code: Option<String>,
}

/// The body of `PATCH /links/{code}`.
#[derive(Debug, Deserialize)]
struct UrlChange {
    url: String,
}
""")
rep('src/routes.rs', '.route("/links/{code}", delete(delete_link))', '.route("/links/{code}", delete(delete_link).patch(change_link))')
rep('src/routes.rs', "async fn link_stats(", '''async fn change_link(
    State(state): State<AppState>,
    Path(code): Path<String>,
    input: Result<Json<UrlChange>, JsonRejection>,
) -> Result<Json<LinkView>, ApiError> {
    let Json(input) = input?;
    let url = check_url(&input.url)?;
    match state.store.update_url(&code, url).await? {
        Some(link) => Ok(Json(LinkView::new(link, &state.base_url))),
        None => Err(ApiError::NotFound(code)),
    }
}

async fn link_stats(''')
t = (d / 'tests/api.rs').read_text()
t += '''
#[tokio::test]
async fn the_address_of_a_link_can_be_changed() {
    let app = test_app().await;
    create(&app, json!({ "url": "https://old.example", "code": "moved" })).await;
    let change = Some(json!({ "url": "https://new.example" }));

    let without_key = call(&app, "PATCH", "/links/moved", None, change.clone()).await;
    assert_eq!(without_key.status, StatusCode::UNAUTHORIZED);

    let changed = call(&app, "PATCH", "/links/moved", Some(KEY), change.clone()).await;
    assert_eq!(changed.status, StatusCode::OK);
    assert_eq!(changed.json["url"], "https://new.example");
    assert_eq!(get(&app, "/moved").await.headers["location"], "https://new.example");

    let unknown = call(&app, "PATCH", "/links/nothing", Some(KEY), change).await;
    assert_eq!(unknown.status, StatusCode::NOT_FOUND);

    let nonsense = Some(json!({ "url": "nonsense" }));
    let refused = call(&app, "PATCH", "/links/moved", Some(KEY), nonsense).await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
}
'''
(d / 'tests/api.rs').write_text(t)
finish(d)

# =====================================================================  B: last visit
d = stage('shortener_a', 'shortener_b'); rep = make_rep(d)
(d / 'migrations/20261115090000_add_last_visited.sql').write_text(
    "-- The time of the latest visit. NULL means that nobody has followed the link yet.\n"
    "ALTER TABLE links ADD COLUMN last_visited TEXT;\n")
rep('src/store.rs', "    pub created_at: String,\n}\n", "    pub created_at: String,\n    pub last_visited: Option<String>,\n}\n")
rep('src/store.rs', "code, url, hits, created_at", "code, url, hits, created_at, last_visited", count=4)
s = (d / 'src/store.rs').read_text()
a = s.index("    /// Counts one visit and returns the address to go to."); b = s.index("    /// Changes the address of a link.")
s = s[:a] + '''    /// Counts one visit, notes its time, and returns the address to go to.
    pub async fn visit(&self, code: &str) -> Result<Option<String>, sqlx::Error> {
        sqlx::query_scalar(
            "UPDATE links SET hits = hits + 1, last_visited = CURRENT_TIMESTAMP
             WHERE code = ? RETURNING url",
        )
        .bind(code)
        .fetch_optional(&self.pool)
        .await
    }

''' + s[b:]
(d / 'src/store.rs').write_text(s)
rep('src/routes.rs', """    hits: i64,
    created_at: String,
}

impl LinkView {""", """    hits: i64,
    created_at: String,
    last_visited: Option<String>,
}

impl LinkView {""")
rep('src/routes.rs', "            created_at: link.created_at,\n        }", "            created_at: link.created_at,\n            last_visited: link.last_visited,\n        }")
t = (d / 'tests/api.rs').read_text()
t += '''
#[tokio::test]
async fn the_last_visit_is_recorded() {
    let app = test_app().await;
    create(&app, json!({ "url": "https://example.com", "code": "seen" })).await;
    assert_eq!(get(&app, "/links/seen").await.json["last_visited"], Value::Null);

    get(&app, "/seen").await;

    assert!(get(&app, "/links/seen").await.json["last_visited"].is_string());
}
'''
(d / 'tests/api.rs').write_text(t)
finish(d)

# =====================================================================  C: expiry
d = stage('shortener_b', 'shortener_c'); rep = make_rep(d)
(d / 'migrations/20261116090000_add_expires_at.sql').write_text(
    "-- Seconds since 1970-01-01 (Unix time). NULL means that the link never expires.\n"
    "ALTER TABLE links ADD COLUMN expires_at INTEGER;\n")
st = 'src/store.rs'
rep(st, "    pub last_visited: Option<String>,\n}\n", """    pub last_visited: Option<String>,
    pub expires_at: Option<i64>,
}

/// What a visit to a short address leads to.
#[derive(Debug, PartialEq)]
pub enum Visit {
    Go(String),
    Expired,
    Unknown,
}
""")
s = (d / st).read_text()
a = s.index("    /// Stores a new link."); b = s.index("    /// Changes the address of a link.")
s = s[:a] + '''    /// Stores a new link. Fails with `CodeTaken` if the code exists already.
    pub async fn insert(&self, code: &str, url: &str, expires_at: Option<i64>) -> Result<Link, ApiError> {
        let result = sqlx::query_as(
            "INSERT INTO links (code, url, expires_at) VALUES (?, ?, ?)
             RETURNING code, url, hits, created_at, last_visited, expires_at",
        )
        .bind(code)
        .bind(url)
        .bind(expires_at)
        .fetch_one(&self.pool)
        .await;

        match result {
            Ok(link) => Ok(link),
            Err(sqlx::Error::Database(error)) if error.is_unique_violation() => {
                Err(ApiError::CodeTaken(code.to_string()))
            }
            Err(error) => Err(error.into()),
        }
    }

    pub async fn find(&self, code: &str) -> Result<Option<Link>, sqlx::Error> {
        sqlx::query_as(
            "SELECT code, url, hits, created_at, last_visited, expires_at
             FROM links WHERE code = ?",
        )
        .bind(code)
        .fetch_optional(&self.pool)
        .await
    }

    /// Counts one visit, if the link exists and has not expired at the time `now`.
    pub async fn visit(&self, code: &str, now: i64) -> Result<Visit, sqlx::Error> {
        let url: Option<String> = sqlx::query_scalar(
            "UPDATE links SET hits = hits + 1, last_visited = CURRENT_TIMESTAMP
             WHERE code = ? AND (expires_at IS NULL OR expires_at > ?)
             RETURNING url",
        )
        .bind(code)
        .bind(now)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(url) = url {
            return Ok(Visit::Go(url));
        }
        // No row was changed: the code is unknown, or the link has expired
        match self.find(code).await? {
            Some(_) => Ok(Visit::Expired),
            None => Ok(Visit::Unknown),
        }
    }

''' + s[b:]
s = s.replace("RETURNING code, url, hits, created_at, last_visited\",", "RETURNING code, url, hits, created_at, last_visited, expires_at\",")
s = s.replace("\"SELECT code, url, hits, created_at, last_visited FROM links\n", "\"SELECT code, url, hits, created_at, last_visited, expires_at FROM links\n")
assert s.count("last_visited, expires_at") == 4, s.count("last_visited, expires_at")
a = s.index("#[cfg(test)]")
s = s[:a] + '''#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_code_can_be_stored_only_once() {
        let store = LinkStore::in_memory().await.unwrap();

        let link = store.insert("docs", "https://docs.rs", None).await.unwrap();
        assert_eq!(link.code, "docs");
        assert_eq!(link.url, "https://docs.rs");
        assert_eq!(link.hits, 0);

        let second = store.insert("docs", "https://example.com", None).await;
        assert!(matches!(second, Err(ApiError::CodeTaken(code)) if code == "docs"));
    }

    #[tokio::test]
    async fn every_visit_is_counted() {
        let store = LinkStore::in_memory().await.unwrap();
        store.insert("docs", "https://docs.rs", None).await.unwrap();
        let go = Visit::Go(String::from("https://docs.rs"));

        assert_eq!(store.visit("docs", 0).await.unwrap(), go);
        assert_eq!(store.visit("docs", 0).await.unwrap(), go);
        assert_eq!(store.visit("other", 0).await.unwrap(), Visit::Unknown);

        assert_eq!(store.find("docs").await.unwrap().unwrap().hits, 2);
    }

    #[tokio::test]
    async fn expired_links_are_not_followed() {
        let store = LinkStore::in_memory().await.unwrap();
        store.insert("docs", "https://docs.rs", Some(500)).await.unwrap();

        let in_time = store.visit("docs", 499).await.unwrap();
        assert_eq!(in_time, Visit::Go(String::from("https://docs.rs")));

        assert_eq!(store.visit("docs", 500).await.unwrap(), Visit::Expired);
        assert_eq!(store.find("docs").await.unwrap().unwrap().hits, 1);
    }

    #[tokio::test]
    async fn deleting_reports_whether_something_was_there() {
        let store = LinkStore::in_memory().await.unwrap();
        store.insert("docs", "https://docs.rs", None).await.unwrap();

        assert!(store.delete("docs").await.unwrap());
        assert!(!store.delete("docs").await.unwrap());
        assert!(store.find("docs").await.unwrap().is_none());
    }
}
'''
(d / st).write_text(s)

rep('src/error.rs', """    #[error("the code '{0}' is already in use")]
    CodeTaken(String),
""", """    #[error("the code '{0}' is already in use")]
    CodeTaken(String),

    #[error("the link '{0}' has expired")]
    Expired(String),
""")
rep('src/error.rs', "            ApiError::CodeTaken(_) => StatusCode::CONFLICT,\n",
    "            ApiError::CodeTaken(_) => StatusCode::CONFLICT,\n            ApiError::Expired(_) => StatusCode::GONE,\n")

rep('src/validate.rs', "/// Makes up a new code.", """/// Checks a lifetime in seconds: at least one second, and at most ten years.
pub fn check_ttl(seconds: i64) -> Result<i64, ApiError> {
    const TEN_YEARS: i64 = 10 * 365 * 24 * 60 * 60;
    if (1..=TEN_YEARS).contains(&seconds) {
        Ok(seconds)
    } else {
        Err(ApiError::invalid("ttl_seconds must be between 1 and 315360000"))
    }
}

/// Makes up a new code.""")
rep('src/validate.rs', "    #[test]\n    fn random_codes_are_valid_and_differ() {", """    #[test]
    fn lifetimes_have_limits() {
        assert_eq!(check_ttl(1).unwrap(), 1);
        assert_eq!(check_ttl(315_360_000).unwrap(), 315_360_000);
        assert!(check_ttl(0).is_err());
        assert!(check_ttl(-60).is_err());
        assert!(check_ttl(315_360_001).is_err());
    }

    #[test]
    fn random_codes_are_valid_and_differ() {""")

r = 'src/routes.rs'
rep(r, "use std::sync::Arc;\nuse std::time::Duration;\n", "use std::sync::Arc;\nuse std::time::{Duration, SystemTime, UNIX_EPOCH};\n")
rep(r, "use crate::store::{Link, LinkStore};\nuse crate::validate::{check_code, check_url, random_code};",
    "use crate::store::{Link, LinkStore, Visit};\nuse crate::validate::{check_code, check_ttl, check_url, random_code};")
rep(r, """/// What every handler can reach.
#[derive(Clone)]
pub struct AppState {
    pub store: LinkStore,
    pub api_key: Arc<str>,
    pub base_url: Arc<str>,
}
""", """/// A source of the current time, in seconds since 1970. Tests supply their own.
pub type Clock = Arc<dyn Fn() -> i64 + Send + Sync>;

/// The real clock of the computer.
pub fn system_clock() -> Clock {
    Arc::new(|| match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(time) => time.as_secs() as i64,
        Err(_) => 0,
    })
}

/// What every handler can reach.
#[derive(Clone)]
pub struct AppState {
    pub store: LinkStore,
    pub api_key: Arc<str>,
    pub base_url: Arc<str>,
    pub clock: Clock,
}
""")
rep(r, """struct NewLink {
    url: String,
    code: Option<String>,
}
""", """struct NewLink {
    url: String,
    code: Option<String>,
    ttl_seconds: Option<i64>,
}
""")
rep(r, """    last_visited: Option<String>,
}

impl LinkView {""", """    last_visited: Option<String>,
    expires_at: Option<i64>,
}

impl LinkView {""")
rep(r, "            last_visited: link.last_visited,\n        }", "            last_visited: link.last_visited,\n            expires_at: link.expires_at,\n        }")
s = (d / r).read_text()
a = s.index("async fn create_link("); b = s.index("async fn change_link(")
s = s[:a] + '''async fn create_link(
    State(state): State<AppState>,
    input: Result<Json<NewLink>, JsonRejection>,
) -> Result<(StatusCode, Json<LinkView>), ApiError> {
    let Json(input) = input?;
    let url = check_url(&input.url)?;
    let expires_at = match input.ttl_seconds {
        Some(seconds) => Some((state.clock)() + check_ttl(seconds)?),
        None => None,
    };
    let link = match &input.code {
        Some(code) => state.store.insert(check_code(code)?, url, expires_at).await?,
        None => insert_with_random_code(&state.store, url, expires_at).await?,
    };
    Ok((StatusCode::CREATED, Json(LinkView::new(link, &state.base_url))))
}

/// Tries random codes until one is free.
async fn insert_with_random_code(
    store: &LinkStore,
    url: &str,
    expires_at: Option<i64>,
) -> Result<Link, ApiError> {
    loop {
        match store.insert(&random_code(), url, expires_at).await {
            Err(ApiError::CodeTaken(_)) => continue,
            other => return other,
        }
    }
}

async fn follow(State(state): State<AppState>, Path(code): Path<String>) -> Result<Redirect, ApiError> {
    let now = (state.clock)();
    match state.store.visit(&code, now).await? {
        Visit::Go(url) => Ok(Redirect::temporary(&url)),
        Visit::Expired => Err(ApiError::Expired(code)),
        Visit::Unknown => Err(ApiError::NotFound(code)),
    }
}

''' + s[b:]
(d / r).write_text(s)

rep('src/lib.rs', "pub use routes::{AppState, app};", "pub use routes::{AppState, Clock, app, system_clock};")
rep('src/main.rs', "use shortener::{AppState, app};", "use shortener::{AppState, app, system_clock};")
rep('src/main.rs', "        base_url: config.base_url.into(),\n", "        base_url: config.base_url.into(),\n        clock: system_clock(),\n")

t = (d / 'tests/api.rs').read_text()
a = t.index("/// A complete application on a fresh, empty database."); b = t.index("/// What came back")
t = t[:a] + '''/// A complete application on a fresh, empty database, with a clock that the test controls.
async fn test_app_at(now: Arc<AtomicI64>) -> Router {
    let store = LinkStore::in_memory().await.unwrap();
    let clock: Clock = Arc::new(move || now.load(Ordering::Relaxed));
    let state = AppState {
        store,
        api_key: KEY.into(),
        base_url: "http://sho.rt".into(),
        clock,
    };
    app(state)
}

/// The same, for tests that do not care about the time.
async fn test_app() -> Router {
    test_app_at(Arc::new(AtomicI64::new(1_000_000))).await
}

''' + t[b:]
assert "use shortener::{AppState, app};" in t
t = t.replace("use shortener::{AppState, app};", "use shortener::{AppState, Clock, app};")
assert "use axum::Router;\n" in t
t = t.replace("use axum::Router;\n", "use std::sync::Arc;\nuse std::sync::atomic::{AtomicI64, Ordering};\n\nuse axum::Router;\n")
t += '''
#[tokio::test]
async fn links_can_expire() {
    let now = Arc::new(AtomicI64::new(1_000));
    let app = test_app_at(now.clone()).await;

    let body = json!({ "url": "https://example.com", "code": "brief", "ttl_seconds": 60 });
    let created = create(&app, body).await;
    assert_eq!(created.json["expires_at"], 1_060);

    // 59 seconds later the link still works
    now.store(1_059, Ordering::Relaxed);
    assert_eq!(get(&app, "/brief").await.status, StatusCode::TEMPORARY_REDIRECT);

    // One second later it has expired
    now.store(1_060, Ordering::Relaxed);
    let late = get(&app, "/brief").await;
    assert_eq!(late.status, StatusCode::GONE);
    assert_eq!(late.json["error"], "the link 'brief' has expired");

    // The refused visit was not counted
    assert_eq!(get(&app, "/links/brief").await.json["hits"], 1);
}

#[tokio::test]
async fn links_without_a_lifetime_never_expire() {
    let now = Arc::new(AtomicI64::new(1_000));
    let app = test_app_at(now.clone()).await;
    create(&app, json!({ "url": "https://example.com", "code": "forever" })).await;

    now.store(i64::MAX, Ordering::Relaxed);

    assert_eq!(get(&app, "/forever").await.status, StatusCode::TEMPORARY_REDIRECT);
}

#[tokio::test]
async fn a_lifetime_must_be_sensible() {
    let app = test_app().await;
    for ttl in [0, -5, 999_999_999_999_i64] {
        let body = json!({ "url": "https://example.com", "ttl_seconds": ttl });
        let reply = create(&app, body).await;
        assert_eq!(reply.status, StatusCode::UNPROCESSABLE_ENTITY, "for {ttl}");
    }
}
'''
(d / 'tests/api.rs').write_text(t)
finish(d)
