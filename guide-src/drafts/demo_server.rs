/// Starts a small practice server inside this program and returns its address.
async fn start_demo_server() -> String {
    use axum::extract::Path;
    use axum::http::StatusCode;
    use axum::routing::{get, post};
    use axum::{Json, Router};
    use serde_json::{json, Value};

    let app = Router::new()
        .route("/hello", get(|| async { "Hello from the server!" }))
        .route(
            "/users/{id}",
            get(|Path(id): Path<u32>| async move {
                match id {
                    1 => Ok(Json(json!({ "id": 1, "name": "Sara", "email": "sara@example.com" }))),
                    2 => Ok(Json(json!({ "id": 2, "name": "Tomas", "email": "tomas@example.com" }))),
                    _ => Err(StatusCode::NOT_FOUND),
                }
            }),
        )
        .route(
            "/users",
            post(|Json(body): Json<Value>| async move {
                (StatusCode::CREATED, Json(json!({ "id": 3, "name": body["name"], "email": body["email"] })))
            }),
        )
        .route(
            "/numbers/{id}",
            get(|Path(id): Path<u64>| async move {
                match id {
                    5 => {
                        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                        Ok(Json(json!({ "value": 50 })))
                    }
                    7 => Err(StatusCode::INTERNAL_SERVER_ERROR),
                    _ => Ok(Json(json!({ "value": id * 10 }))),
                }
            }),
        )
        .route(
            "/slow",
            get(|| async {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                "finally"
            }),
        );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{address}")
}
