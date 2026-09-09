use statusline_runtime_tests::{app_server, codex_installation};

fn main() {
    let read_usage = std::env::args().skip(1).any(|arg| arg == "--usage");
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime");
    runtime.block_on(async {
        let diagnostic = codex_installation::inspect_codex(None)
            .await
            .expect("diagnostic");
        println!("{}", serde_json::to_string_pretty(&diagnostic).unwrap());
        if read_usage {
            // Explicit opt-in only. Production normalizer excludes email, account
            // IDs and credentials. Never print raw App Server responses/logs.
            let usage = app_server::fetch_usage("runtime-check", None).await;
            println!("{}", serde_json::to_string_pretty(&usage).unwrap());
        }
    });
}
