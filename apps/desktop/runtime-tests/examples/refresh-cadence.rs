//! Wall-clock check of the production native timer (no WebView or account).
//! Prints only elapsed times; never reads credentials or publishes a snapshot.
use statusline_runtime_tests::refresh::{AUTO_REFRESH_INTERVAL, refresh_interval};

fn main() {
    tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .build()
        .unwrap()
        .block_on(async {
            let started = std::time::Instant::now();
            let mut interval = refresh_interval();
            for cycle in 0..=2 {
                interval.tick().await;
                let elapsed = started.elapsed();
                println!(
                    "native_tick={cycle} elapsed_seconds={:.3} frontend=absent",
                    elapsed.as_secs_f64()
                );
                let expected = AUTO_REFRESH_INTERVAL * cycle;
                assert!(elapsed >= expected);
                assert!(
                    elapsed < expected + std::time::Duration::from_secs(5),
                    "Timer delayed: check sleep/OS scheduling"
                );
            }
        });
}
