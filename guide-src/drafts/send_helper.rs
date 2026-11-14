/// Hands one request straight to the router, as a client would send it, and prints the response.
async fn send(app: &Router, method: &str, path: &str, body: &str) {
    use tower::ServiceExt;

    let request = axum::http::Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json")
        .body(axum::body::Body::from(body.to_string()))
        .unwrap();

    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    println!("{method} {path} -> {status}  {}", String::from_utf8_lossy(&bytes));
}
