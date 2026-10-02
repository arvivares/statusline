//! Periodic quota alerts. Never infer a reset solely from the wall clock.
//! Keep unrounded readings local; the relay receives only a bounded event.
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};
use tokio::sync::Mutex;
use uuid::Uuid;

pub const CAPABILITY: &str = "quota-alerts-v1";
const FILE: &str = "quota-alerts-v1.json";
const FRESH_SECONDS: i64 = 600;
const WARNING_SECONDS: i64 = 3600;
const MAX_TIMESTAMP: i64 = 253_402_300_799;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Provider {
    Codex,
    Antigravity,
    Claude,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Window {
    Short,
    Weekly,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    QuotaRecovered,
    WeeklyExpiring,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Alert {
    pub event_id: String,
    pub provider: Provider,
    pub kind: Kind,
    pub window: Window,
    pub expires_at: i64,
}

pub struct Reading {
    pub remaining: f64,
    pub resets_at: i64,
}
pub struct Sample {
    pub checked_at: i64,
    pub weekly: Option<Reading>,
    pub short: Option<Reading>,
}

#[derive(Clone, Serialize, Deserialize)]
struct Cycle {
    window: Window,
    reset_at: i64,
    checked_at: i64,
    exhausted: bool,
    warned: bool,
}
#[derive(Clone, Serialize, Deserialize)]
struct Pending {
    alert: Alert,
    cycle_reset_at: i64,
}
#[derive(Clone, Default, Serialize, Deserialize)]
struct State {
    schema_version: u8,
    cycles: BTreeMap<Provider, Vec<Cycle>>,
    pending: Vec<Pending>,
}
#[derive(Default)]
struct Storage {
    state: State,
    path: Option<PathBuf>,
}
#[derive(Default)]
pub struct Tracker {
    storage: Mutex<Storage>,
}

impl Tracker {
    pub async fn configure(&self, directory: &Path) {
        let mut storage = self.storage.lock().await;
        let path = directory.join(FILE);
        if let Ok(metadata) = tokio::fs::symlink_metadata(&path).await
            && metadata.is_file()
            && !metadata.file_type().is_symlink()
            && metadata.len() <= 64 * 1024
            && let Ok(bytes) = tokio::fs::read(&path).await
            && let Ok(state) = serde_json::from_slice::<State>(&bytes)
            && state.schema_version == 1
            && state.pending.len() <= 12
            && state.cycles.values().all(|cycles| {
                cycles.len() <= 2
                    && cycles.iter().all(|c| {
                        (1..=MAX_TIMESTAMP).contains(&c.checked_at)
                            && (1..=MAX_TIMESTAMP).contains(&c.reset_at)
                    })
            })
            && state.pending.iter().all(|p| {
                Uuid::parse_str(&p.alert.event_id).is_ok_and(|id| id.get_version_num() == 4)
                    && (1..=MAX_TIMESTAMP).contains(&p.cycle_reset_at)
                    && (1..=MAX_TIMESTAMP).contains(&p.alert.expires_at)
            })
        {
            storage.state = state;
        }
        storage.path = Some(path);
    }

    pub async fn observe(&self, provider: Provider, sample: Option<Sample>, now: i64) -> bool {
        let mut storage = self.storage.lock().await;
        let previous = storage.state.clone();
        let state = &mut storage.state;
        state.schema_version = 1;
        state.pending.retain(|p| p.alert.expires_at > now);
        let Some(sample) = sample else {
            // Temporary unavailability must not erase the baseline or warning
            // dedup; absence alone never produces an event.
            state.pending.retain(|p| p.alert.provider != provider);
            persist_or_revert(&mut storage, previous).await;
            return false;
        };
        if sample.checked_at <= 0
            || sample.checked_at > now
            || now - sample.checked_at > FRESH_SECONDS
        {
            return false;
        }
        let cycles = state.cycles.entry(provider).or_default();
        for (window, reading) in [
            (Window::Weekly, sample.weekly),
            (Window::Short, sample.short),
        ] {
            let valid = reading.filter(|r| {
                r.remaining.is_finite()
                    && (0.0..=100.0).contains(&r.remaining)
                    && r.resets_at > now
                    && r.resets_at - now
                        <= if window == Window::Weekly {
                            8 * 86400
                        } else {
                            5 * 3600
                        }
            });
            let Some(reading) = valid else {
                // Absence/expired data is not proof of recovery. Retain an exhausted
                // cycle briefly so a subsequent authoritative sample can confirm it.
                state
                    .pending
                    .retain(|p| p.alert.provider != provider || p.alert.window != window);
                cycles.retain(|c| {
                    c.window != window || (c.exhausted && now - c.reset_at <= WARNING_SECONDS)
                });
                continue;
            };
            let old = cycles.iter().find(|c| c.window == window).cloned();
            if old
                .as_ref()
                .is_some_and(|c| sample.checked_at <= c.checked_at)
            {
                continue;
            }
            state.pending.retain(|p| {
                p.alert.provider != provider
                    || p.alert.window != window
                    || (p.cycle_reset_at == reading.resets_at
                        && if p.alert.kind == Kind::WeeklyExpiring {
                            reading.remaining >= 20.0
                        } else {
                            reading.remaining > 0.0
                        })
            });
            let same = old
                .as_ref()
                .is_some_and(|c| c.reset_at == reading.resets_at);
            let mut cycle = Cycle {
                window,
                reset_at: reading.resets_at,
                checked_at: sample.checked_at,
                exhausted: reading.remaining == 0.0,
                warned: same && old.as_ref().is_some_and(|c| c.warned),
            };
            // A credit redemption / early reset / mere increase is NOT a scheduled recovery.
            if old.as_ref().is_some_and(|c| {
                c.exhausted
                    && c.reset_at <= sample.checked_at
                    && now - c.reset_at <= WARNING_SECONDS
                    && reading.resets_at > c.reset_at
            }) && reading.remaining > 0.0
            {
                state.pending.push(Pending {
                    cycle_reset_at: reading.resets_at,
                    alert: Alert {
                        event_id: Uuid::new_v4().to_string(),
                        provider,
                        kind: Kind::QuotaRecovered,
                        window,
                        expires_at: (now + WARNING_SECONDS).min(reading.resets_at),
                    },
                });
            }
            if window == Window::Weekly
                && !cycle.warned
                && reading.remaining >= 20.0
                && reading.resets_at - now <= WARNING_SECONDS
            {
                cycle.warned = true;
                state.pending.push(Pending {
                    cycle_reset_at: reading.resets_at,
                    alert: Alert {
                        event_id: Uuid::new_v4().to_string(),
                        provider,
                        kind: Kind::WeeklyExpiring,
                        window,
                        expires_at: reading.resets_at,
                    },
                });
            }
            cycles.retain(|c| c.window != window);
            cycles.push(cycle);
        }
        let pending = !state.pending.is_empty();
        persist_or_revert(&mut storage, previous).await && pending
    }

    pub async fn pending(&self, now: i64) -> Vec<Alert> {
        let storage = self.storage.lock().await;
        storage
            .state
            .pending
            .iter()
            .filter(|p| {
                p.alert.expires_at > now
                    && storage
                        .state
                        .cycles
                        .get(&p.alert.provider)
                        .is_some_and(|cycles| {
                            cycles.iter().any(|c| {
                                c.window == p.alert.window
                                    && c.reset_at == p.cycle_reset_at
                                    && c.checked_at <= now
                                    && now - c.checked_at <= FRESH_SECONDS
                            })
                        })
            })
            .map(|p| p.alert.clone())
            .collect()
    }

    pub async fn complete(&self, id: &str) {
        let mut storage = self.storage.lock().await;
        let previous = storage.state.clone();
        storage.state.pending.retain(|p| p.alert.event_id != id);
        persist_or_revert(&mut storage, previous).await;
    }

    pub async fn remove(&self, provider: Provider) {
        let mut storage = self.storage.lock().await;
        let previous = storage.state.clone();
        storage.state.cycles.remove(&provider);
        storage
            .state
            .pending
            .retain(|p| p.alert.provider != provider);
        persist_or_revert(&mut storage, previous).await;
    }

    pub async fn clear(&self) {
        let mut storage = self.storage.lock().await;
        let previous = storage.state.clone();
        storage.state = State {
            schema_version: 1,
            ..State::default()
        };
        persist_or_revert(&mut storage, previous).await;
    }
}

// Serialize all disk updates under the same lock. NamedTempFile gives 0600 on Unix;
// atomic replacement also works on Windows without deleting the previous file first.
async fn persist_or_revert(storage: &mut Storage, previous: State) -> bool {
    let Some(path) = storage.path.clone() else {
        return true;
    };
    let Ok(bytes) = serde_json::to_vec(&storage.state) else {
        storage.state = previous;
        return false;
    };
    let saved = tokio::task::spawn_blocking(move || -> std::io::Result<()> {
        use std::io::Write;
        let directory = path
            .parent()
            .ok_or_else(|| std::io::Error::other("Invalid tracker path"))?;
        std::fs::create_dir_all(directory)?;
        let mut file = tempfile::NamedTempFile::new_in(directory)?;
        file.write_all(&bytes)?;
        file.as_file().sync_all()?;
        file.persist(path).map_err(|error| error.error)?;
        Ok(())
    })
    .await
    .is_ok_and(|r| r.is_ok());
    if !saved {
        storage.state = previous;
    }
    saved
}

pub fn codex_sample(usage: &crate::usage::UsageResponse) -> Option<Sample> {
    let crate::usage::UsageResponse::Ready {
        weekly,
        short_window,
        checked_at,
        ..
    } = usage
    else {
        return None;
    };
    Some(Sample {
        checked_at: *checked_at,
        weekly: (weekly.window_duration_mins >= 8640 && weekly.window_duration_mins <= 11520)
            .then_some(Reading {
                remaining: weekly.remaining_percent,
                resets_at: weekly.resets_at,
            }),
        short: short_window
            .as_ref()
            .filter(|w| w.window_duration_mins == 300)
            .map(|w| Reading {
                remaining: w.remaining_percent,
                resets_at: w.resets_at,
            }),
    })
}

pub fn google_sample(view: &crate::antigravity::View) -> Option<Sample> {
    let crate::antigravity::Usage::Ready {
        checked_at, quota, ..
    } = &view.usage
    else {
        return None;
    };
    view.settings.source?;
    Some(Sample {
        checked_at: *checked_at,
        weekly: quota.weekly.as_ref().map(|w| Reading {
            remaining: w.remaining_percent,
            resets_at: w.resets_at,
        }),
        short: quota.short_window.as_ref().map(|w| Reading {
            remaining: w.remaining_percent,
            resets_at: w.resets_at,
        }),
    })
}

pub fn claude_sample(view: &crate::claude::View) -> Option<Sample> {
    if view.status != crate::claude::Status::Ready {
        return None;
    }
    let sample = view.quota.as_ref()?;
    Some(Sample {
        checked_at: sample.checked_at,
        weekly: sample.weekly.as_ref().map(|w| Reading {
            remaining: w.remaining_percent,
            resets_at: w.resets_at,
        }),
        short: sample.short_window.as_ref().map(|w| Reading {
            remaining: w.remaining_percent,
            resets_at: w.resets_at,
        }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    const NOW: i64 = 1_900_000_000;
    fn sample(at: i64, weekly: Option<(f64, i64)>, short: Option<(f64, i64)>) -> Sample {
        Sample {
            checked_at: at,
            weekly: weekly.map(|(remaining, resets_at)| Reading {
                remaining,
                resets_at,
            }),
            short: short.map(|(remaining, resets_at)| Reading {
                remaining,
                resets_at,
            }),
        }
    }
    #[tokio::test]
    async fn exact_threshold_and_once_per_cycle() {
        for provider in [Provider::Codex, Provider::Antigravity, Provider::Claude] {
            let tracker = Tracker::default();
            tracker
                .observe(
                    provider,
                    Some(sample(NOW, Some((20.0, NOW + 3601)), None)),
                    NOW,
                )
                .await;
            assert!(tracker.pending(NOW).await.is_empty());
            tracker
                .observe(
                    provider,
                    Some(sample(NOW + 1, Some((19.6, NOW + 3601)), None)),
                    NOW + 1,
                )
                .await;
            assert!(tracker.pending(NOW + 1).await.is_empty());
            tracker
                .observe(
                    provider,
                    Some(sample(NOW + 2, Some((20.0, NOW + 3601)), None)),
                    NOW + 2,
                )
                .await;
            let events = tracker.pending(NOW + 2).await;
            assert_eq!(events.len(), 1);
            assert_eq!(events[0].kind, Kind::WeeklyExpiring);
            tracker.complete(&events[0].event_id).await;
            tracker
                .observe(
                    provider,
                    Some(sample(NOW + 3, Some((21.0, NOW + 3601)), None)),
                    NOW + 3,
                )
                .await;
            assert!(tracker.pending(NOW + 3).await.is_empty());
        }
    }
    #[tokio::test]
    async fn recovery_requires_exact_zero_and_confirmed_new_period() {
        for window in [Window::Weekly, Window::Short] {
            let tracker = Tracker::default();
            let data = |at, percent, reset| {
                if window == Window::Weekly {
                    sample(at, Some((percent, reset)), None)
                } else {
                    sample(at, None, Some((percent, reset)))
                }
            };
            tracker
                .observe(Provider::Codex, Some(data(NOW, 0.4, NOW + 100)), NOW)
                .await;
            tracker
                .observe(
                    Provider::Codex,
                    Some(data(NOW + 1, 5.0, NOW + 100)),
                    NOW + 1,
                )
                .await;
            assert!(tracker.pending(NOW + 1).await.is_empty());
            tracker
                .observe(
                    Provider::Codex,
                    Some(data(NOW + 2, 0.0, NOW + 100)),
                    NOW + 2,
                )
                .await;
            assert!(tracker.pending(NOW + 101).await.is_empty());
            tracker
                .observe(
                    Provider::Codex,
                    Some(data(NOW + 101, 80.0, NOW + 10000)),
                    NOW + 101,
                )
                .await;
            let events = tracker.pending(NOW + 101).await;
            assert_eq!(events.len(), 1);
            assert_eq!(events[0].kind, Kind::QuotaRecovered);
            assert_eq!(events[0].window, window);
            tracker
                .observe(
                    Provider::Codex,
                    Some(data(NOW + 102, 79.0, NOW + 10000)),
                    NOW + 102,
                )
                .await;
            assert_eq!(
                tracker.pending(NOW + 102).await[0].event_id,
                events[0].event_id
            );
        }
    }
    #[tokio::test]
    async fn startup_early_reset_and_stale_data_never_imply_recovery() {
        let t = Tracker::default();
        t.observe(
            Provider::Claude,
            Some(sample(NOW, Some((90.0, NOW + 10000)), None)),
            NOW,
        )
        .await;
        assert!(t.pending(NOW).await.is_empty());
        t.observe(
            Provider::Claude,
            Some(sample(NOW + 1, Some((0.0, NOW + 10000)), None)),
            NOW + 1,
        )
        .await;
        t.observe(
            Provider::Claude,
            Some(sample(NOW + 2, Some((90.0, NOW + 20000)), None)),
            NOW + 2,
        )
        .await;
        assert!(t.pending(NOW + 2).await.is_empty());
        t.observe(
            Provider::Claude,
            Some(sample(NOW + 3, Some((90.0, NOW + 3000)), None)),
            NOW + 700,
        )
        .await;
        assert!(t.pending(NOW + 700).await.is_empty());
    }
    #[tokio::test]
    async fn warning_dropped_after_spend_expiry_missing_or_stale_readings() {
        let t = Tracker::default();
        t.observe(
            Provider::Antigravity,
            Some(sample(NOW, Some((30.0, NOW + 3000)), None)),
            NOW,
        )
        .await;
        assert_eq!(t.pending(NOW).await.len(), 1);
        assert!(t.pending(NOW + 601).await.is_empty());
        t.observe(
            Provider::Antigravity,
            Some(sample(NOW + 1, Some((19.9, NOW + 3000)), None)),
            NOW + 1,
        )
        .await;
        assert!(t.pending(NOW + 1).await.is_empty());
        t.observe(Provider::Antigravity, None, NOW + 2).await;
        assert!(t.pending(NOW + 2).await.is_empty());
        t.observe(
            Provider::Codex,
            Some(sample(NOW, Some((20.0, NOW + 10)), None)),
            NOW,
        )
        .await;
        assert!(t.pending(NOW + 10).await.is_empty());
    }
    #[tokio::test]
    async fn restart_preserves_opaque_event_and_ack_dedup() {
        let directory = tempfile::tempdir().unwrap();
        let t = Tracker::default();
        t.configure(directory.path()).await;
        t.observe(
            Provider::Codex,
            Some(sample(NOW, Some((20.0, NOW + 3000)), None)),
            NOW,
        )
        .await;
        let event = t.pending(NOW).await.remove(0);
        let restarted = Tracker::default();
        restarted.configure(directory.path()).await;
        assert_eq!(restarted.pending(NOW).await[0].event_id, event.event_id);
        restarted.complete(&event.event_id).await;
        let again = Tracker::default();
        again.configure(directory.path()).await;
        again
            .observe(
                Provider::Codex,
                Some(sample(NOW + 1, Some((20.0, NOW + 3000)), None)),
                NOW + 1,
            )
            .await;
        assert!(again.pending(NOW + 1).await.is_empty());
        let wire = serde_json::to_string(&event).unwrap();
        assert!(!wire.contains("remaining"));
        assert!(!wire.contains("resetAt"));
    }

    #[tokio::test]
    async fn each_provider_and_window_recovers_independently_after_restart() {
        let directory = tempfile::tempdir().unwrap();
        let t = Tracker::default();
        t.configure(directory.path()).await;
        for provider in [Provider::Codex, Provider::Antigravity, Provider::Claude] {
            t.observe(
                provider,
                Some(sample(NOW, Some((0.0, NOW + 10)), Some((0.0, NOW + 20)))),
                NOW,
            )
            .await;
        }
        let t = Tracker::default();
        t.configure(directory.path()).await;
        for provider in [Provider::Codex, Provider::Antigravity, Provider::Claude] {
            t.observe(
                provider,
                Some(sample(
                    NOW + 21,
                    Some((90.0, NOW + 7 * 86400)),
                    Some((80.0, NOW + 18000)),
                )),
                NOW + 21,
            )
            .await;
        }
        let events = t.pending(NOW + 21).await;
        assert_eq!(events.len(), 6);
        for provider in [Provider::Codex, Provider::Antigravity, Provider::Claude] {
            assert_eq!(events.iter().filter(|e| e.provider == provider).count(), 2);
        }
    }

    #[tokio::test]
    async fn unavailable_reading_preserves_dedup_but_removed_service_resets_baseline() {
        let t = Tracker::default();
        t.observe(
            Provider::Codex,
            Some(sample(NOW, Some((30.0, NOW + 3000)), None)),
            NOW,
        )
        .await;
        let event = t.pending(NOW).await.remove(0);
        t.complete(&event.event_id).await;
        t.observe(Provider::Codex, None, NOW + 1).await;
        t.observe(
            Provider::Codex,
            Some(sample(NOW + 2, Some((30.0, NOW + 3000)), None)),
            NOW + 2,
        )
        .await;
        assert!(t.pending(NOW + 2).await.is_empty());
        t.observe(
            Provider::Codex,
            Some(sample(NOW + 3, None, Some((0.0, NOW + 10)))),
            NOW + 3,
        )
        .await;
        t.remove(Provider::Codex).await;
        t.observe(
            Provider::Codex,
            Some(sample(NOW + 11, None, Some((80.0, NOW + 18000)))),
            NOW + 11,
        )
        .await;
        assert!(t.pending(NOW + 11).await.is_empty());
    }

    #[tokio::test]
    async fn stale_out_of_order_future_and_invalid_readings_do_not_alert() {
        let t = Tracker::default();
        for remaining in [f64::NAN, f64::INFINITY, -1.0, 101.0] {
            t.observe(
                Provider::Codex,
                Some(sample(NOW, Some((remaining, NOW + 3000)), None)),
                NOW,
            )
            .await;
        }
        for checked in [i64::MIN, 0, NOW + 1, NOW - 601] {
            t.observe(
                Provider::Codex,
                Some(sample(checked, Some((25.0, NOW + 3000)), None)),
                NOW,
            )
            .await;
        }
        assert!(t.pending(NOW).await.is_empty());
        t.observe(
            Provider::Codex,
            Some(sample(NOW, Some((0.4, NOW + 3000)), None)),
            NOW,
        )
        .await;
        t.observe(
            Provider::Codex,
            Some(sample(NOW - 1, Some((80.0, NOW + 3000)), None)),
            NOW,
        )
        .await;
        assert!(t.pending(NOW).await.is_empty());
    }

    #[tokio::test]
    async fn failed_persistence_does_not_release_a_new_alert() {
        let directory = tempfile::tempdir().unwrap();
        let not_a_directory = directory.path().join("file");
        std::fs::write(&not_a_directory, b"fixture").unwrap();
        let t = Tracker::default();
        t.configure(&not_a_directory).await;
        assert!(
            !t.observe(
                Provider::Codex,
                Some(sample(NOW, Some((25.0, NOW + 3000)), None)),
                NOW
            )
            .await
        );
        assert!(t.pending(NOW).await.is_empty());
    }
}
