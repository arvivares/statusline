//! Native refresh scheduling. No WebView, window visibility or JS timer dependency.
use std::{
    future::Future,
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};
use tokio::{
    sync::Mutex,
    time::{Instant, Interval, MissedTickBehavior},
};

pub const AUTO_REFRESH_INTERVAL: Duration = Duration::from_secs(5 * 60);
pub const FOCUS_REFRESH_AGE: Duration = Duration::from_secs(60);

pub fn refresh_interval() -> Interval {
    // First tick is immediate. After sleep/slow networking, never replay a burst
    // of missed publications. OS suspension may still delay the next tick.
    let mut interval = tokio::time::interval(AUTO_REFRESH_INTERVAL);
    interval.set_missed_tick_behavior(MissedTickBehavior::Skip);
    interval
}

pub struct RefreshCoordinator<T> {
    latest: Mutex<Option<(Instant, T)>>,
    generation: AtomicU64,
}

impl<T> Default for RefreshCoordinator<T> {
    fn default() -> Self {
        Self {
            latest: Mutex::new(None),
            generation: AtomicU64::new(0),
        }
    }
}

impl<T: Clone> RefreshCoordinator<T> {
    /// Serialize fetch + publish. Callers arriving during the same operation
    /// reuse its result instead of queueing another Codex process/publication.
    pub async fn refresh<F, Fut>(&self, minimum_age: Duration, operation: F) -> T
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = T>,
    {
        let generation = self.generation.load(Ordering::Acquire);
        let mut latest = self.latest.lock().await;
        if let Some((completed_at, value)) = latest.as_ref() {
            if self.generation.load(Ordering::Acquire) != generation
                || completed_at.elapsed() < minimum_age
            {
                return value.clone();
            }
        }
        let value = operation().await;
        *latest = Some((Instant::now(), value.clone()));
        self.generation.fetch_add(1, Ordering::Release);
        value
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap()
    }

    #[test]
    fn cadence_is_five_minutes_without_any_frontend() {
        runtime().block_on(async {
            tokio::time::pause();
            let mut interval = refresh_interval();
            let first = interval.tick().await;
            let second = interval.tick().await;
            let third = interval.tick().await;
            assert_eq!(second - first, Duration::from_secs(300));
            assert_eq!(third - second, Duration::from_secs(300));
        });
    }

    #[test]
    fn missed_ticks_do_not_cause_a_catch_up_burst() {
        runtime().block_on(async {
            tokio::time::pause();
            let mut interval = refresh_interval();
            interval.tick().await;
            tokio::time::advance(Duration::from_secs(1_801)).await;
            interval.tick().await;
            let recovered_at = Instant::now();
            interval.tick().await;
            assert!(recovered_at.elapsed() >= Duration::from_secs(299));
        });
    }

    #[test]
    fn foreground_reads_reuse_recent_results_and_errors_can_recover() {
        runtime().block_on(async {
            tokio::time::pause();
            let coordinator = RefreshCoordinator::default();
            assert_eq!(
                coordinator
                    .refresh(Duration::ZERO, || async { Err::<(), _>("offline") })
                    .await,
                Err("offline")
            );
            assert_eq!(
                coordinator
                    .refresh(FOCUS_REFRESH_AGE, || async { panic!("duplicate read") })
                    .await,
                Err("offline")
            );
            tokio::time::advance(AUTO_REFRESH_INTERVAL).await;
            assert_eq!(
                coordinator
                    .refresh(Duration::ZERO, || async { Ok(()) })
                    .await,
                Ok(())
            );
        });
    }

    #[test]
    fn overlapping_manual_and_periodic_requests_share_one_operation() {
        runtime().block_on(async {
            let coordinator = std::sync::Arc::new(RefreshCoordinator::default());
            let (entered, started) = tokio::sync::oneshot::channel();
            let (release, resume) = tokio::sync::oneshot::channel();
            let first_coordinator = coordinator.clone();
            let first = tokio::spawn(async move {
                first_coordinator
                    .refresh(Duration::ZERO, || async {
                        entered.send(()).unwrap();
                        resume.await.unwrap();
                        53
                    })
                    .await
            });
            started.await.unwrap();
            let second =
                coordinator.refresh(Duration::ZERO, || async { panic!("duplicate publication") });
            let mut second = std::pin::pin!(second);
            std::future::poll_fn(|context| {
                assert!(second.as_mut().poll(context).is_pending());
                std::task::Poll::Ready(())
            })
            .await;
            release.send(()).unwrap();
            assert_eq!(first.await.unwrap(), 53);
            assert_eq!(second.await, 53);
        });
    }

    #[test]
    fn cancellation_releases_the_operation_lock() {
        runtime().block_on(async {
            let coordinator = std::sync::Arc::new(RefreshCoordinator::default());
            let (entered, started) = tokio::sync::oneshot::channel();
            let first_coordinator = coordinator.clone();
            let first = tokio::spawn(async move {
                first_coordinator
                    .refresh(Duration::ZERO, || async {
                        entered.send(()).unwrap();
                        std::future::pending::<i32>().await
                    })
                    .await
            });
            started.await.unwrap();
            first.abort();
            assert!(first.await.unwrap_err().is_cancelled());
            assert_eq!(
                coordinator.refresh(Duration::ZERO, || async { 53 }).await,
                53
            );
        });
    }
}
