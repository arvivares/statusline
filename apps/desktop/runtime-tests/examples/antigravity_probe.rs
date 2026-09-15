//! Explicit, account-local diagnostic: never runs from the test suite or CI.
//! Emits only the same Google-only state as the Companion UI, no raw responses.
use statusline_runtime_tests::antigravity::{self, Settings, Source};

fn main() {
    if std::env::args().nth(1).as_deref() == Some("auto") {
        let directory = tempfile::tempdir().unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let view = runtime.block_on(
            antigravity::State::default()
                .refresh(Some(directory.path()), std::time::Duration::ZERO),
        );
        println!("{}", serde_json::to_string(&view).unwrap());
        if !matches!(view.usage, antigravity::Usage::Ready { .. }) {
            std::process::exit(1);
        }
        return;
    }
    let source = match std::env::args().nth(1).as_deref() {
        Some("desktop") => Source::Desktop,
        Some("cli") => Source::Cli,
        _ => {
            eprintln!("Usage: antigravity_probe auto|desktop|cli [absolute-path]");
            std::process::exit(2);
        }
    };
    let settings = Settings {
        source: Some(source),
        path: std::env::args().nth(2).map(Into::into),
        automatic: false,
    };
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let result = runtime.block_on(antigravity::collect(&settings));
    println!("{}", serde_json::to_string(&result).unwrap());
    if !matches!(result, antigravity::Usage::Ready { .. }) {
        std::process::exit(1);
    }
}
