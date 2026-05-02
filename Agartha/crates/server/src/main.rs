#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    agartha_server::api::routes::serve_from_env().await
}
