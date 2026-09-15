//! Public quota projection only. Vendor responses, credentials and paths never
//! enter this model. A complete inventory replaces the previous inventory.
use serde::{Deserialize, Serialize};

use crate::{antigravity, relay_protocol::UsageSnapshot, usage::UsageResponse};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaWindow {
    pub remaining_percentage: i64,
    pub reset_at: i64,
    pub window_minutes: u64,
}

impl QuotaWindow {
    fn new(percentage: f64, reset_at: i64, window_minutes: u64) -> Self {
        Self {
            remaining_percentage: percentage.round().clamp(0.0, 100.0) as i64,
            reset_at,
            window_minutes,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSnapshot {
    pub id: String,
    pub status: String,
    pub updated_at: i64,
    pub weekly: Option<QuotaWindow>,
    pub short_window: Option<QuotaWindow>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServicesSnapshot {
    pub schema_version: u8,
    pub updated_at: i64,
    pub providers: Vec<ProviderSnapshot>,
}

/// Collection caches are independent. Do not publish a partial startup inventory
/// that could erase the other provider while its first collection is running.
#[derive(Default)]
pub struct ServicesInventory {
    codex: Option<Option<ProviderSnapshot>>,
    google: Option<Option<ProviderSnapshot>>,
    google_revision: u64,
    updated_at: i64,
    legacy_codex: Option<UsageSnapshot>,
}

impl ServicesInventory {
    pub fn record_codex(&mut self, usage: &UsageResponse) -> bool {
        let (checked_at, next) = match usage {
            UsageResponse::Ready {
                weekly,
                short_window,
                checked_at,
                ..
            } => (
                *checked_at,
                Some(ProviderSnapshot {
                    id: "codex".into(),
                    status: "ready".into(),
                    updated_at: *checked_at,
                    weekly: Some(QuotaWindow::new(
                        weekly.remaining_percent,
                        weekly.resets_at,
                        weekly.window_duration_mins,
                    )),
                    short_window: short_window.as_ref().map(|w| {
                        QuotaWindow::new(w.remaining_percent, w.resets_at, w.window_duration_mins)
                    }),
                }),
            ),
            UsageResponse::Error {
                code, checked_at, ..
            } if code == "codexNotFound" => (*checked_at, None),
            UsageResponse::Error { checked_at, .. }
            | UsageResponse::Unavailable { checked_at, .. } => {
                (*checked_at, Some(unavailable("codex", *checked_at)))
            }
        };
        if self.codex.as_ref().is_some_and(|old| *old == next) {
            return false;
        }
        self.codex = Some(next);
        self.legacy_codex = UsageSnapshot::from_usage(usage);
        self.updated_at = self.updated_at.max(checked_at);
        true
    }

    pub fn record_google(&mut self, view: &antigravity::View) -> bool {
        if view.revision <= self.google_revision {
            return false;
        }
        self.google_revision = view.revision;
        // Visibility matches Companion's discovered/pinned service, including
        // hiding a source explicitly disabled or no longer installed.
        let visible = view.settings.source.is_some()
            && !matches!(view.usage, antigravity::Usage::Disabled)
            && !matches!(
                view.usage,
                antigravity::Usage::Unavailable {
                    reason: antigravity::Failure::NotFound | antigravity::Failure::InvalidPath,
                    ..
                }
            );
        let (checked_at, next) = match &view.usage {
            antigravity::Usage::Ready {
                checked_at, quota, ..
            } if visible => (
                *checked_at,
                Some(ProviderSnapshot {
                    id: "antigravity".into(),
                    status: "ready".into(),
                    updated_at: *checked_at,
                    weekly: quota
                        .weekly
                        .as_ref()
                        .map(|w| QuotaWindow::new(w.remaining_percent, w.resets_at, 10080)),
                    short_window: quota
                        .short_window
                        .as_ref()
                        .map(|w| QuotaWindow::new(w.remaining_percent, w.resets_at, 300)),
                }),
            ),
            antigravity::Usage::Unavailable { checked_at, .. } if visible => {
                (*checked_at, Some(unavailable("antigravity", *checked_at)))
            }
            _ => (antigravity::timestamp(), None),
        };
        if self.google.as_ref().is_some_and(|old| *old == next) {
            return false;
        }
        self.google = Some(next);
        self.updated_at = self.updated_at.max(checked_at);
        true
    }

    pub fn snapshot(&self) -> Option<ServicesSnapshot> {
        let (codex, google) = (self.codex.as_ref()?, self.google.as_ref()?);
        Some(ServicesSnapshot {
            schema_version: 1,
            updated_at: self.updated_at,
            providers: [codex.clone(), google.clone()]
                .into_iter()
                .flatten()
                .collect(),
        })
    }

    pub fn codex_projection(&self) -> Option<&UsageSnapshot> {
        self.legacy_codex.as_ref()
    }
}

fn unavailable(id: &str, updated_at: i64) -> ProviderSnapshot {
    ProviderSnapshot {
        id: id.into(),
        status: "unavailable".into(),
        updated_at,
        weekly: None,
        short_window: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::antigravity::{GoogleQuota, Quota, Settings, Source, Usage, View};

    fn google(revision: u64) -> View {
        View {
            revision,
            settings: Settings {
                source: Some(Source::Desktop),
                ..Settings::default()
            },
            usage: Usage::Ready {
                source: Source::Desktop,
                checked_at: 1_900_000_000,
                quota: GoogleQuota {
                    weekly: None,
                    short_window: Some(Quota {
                        remaining_percent: 72.5,
                        resets_at: 1_900_003_600,
                    }),
                },
            },
        }
    }
    fn missing_codex() -> UsageResponse {
        UsageResponse::Error {
            code: "codexNotFound".into(),
            message: "private local path must never cross the relay".into(),
            checked_at: 1_900_000_000,
        }
    }

    #[test]
    fn startup_waits_for_both_collectors_and_google_only_does_not_invent_codex() {
        let mut inventory = ServicesInventory::default();
        inventory.record_google(&google(1));
        assert!(inventory.snapshot().is_none());
        inventory.record_codex(&missing_codex());
        let snapshot = inventory.snapshot().unwrap();
        assert_eq!(snapshot.providers.len(), 1);
        assert_eq!(snapshot.providers[0].id, "antigravity");
        assert!(snapshot.providers[0].weekly.is_none());
        assert_eq!(
            snapshot.providers[0]
                .short_window
                .as_ref()
                .unwrap()
                .window_minutes,
            300
        );
        assert_eq!(
            snapshot.providers[0]
                .short_window
                .as_ref()
                .unwrap()
                .remaining_percentage,
            73
        );
        assert!(inventory.codex_projection().is_none());
        let encoded = serde_json::to_string(&snapshot).unwrap();
        for private in ["path", "source", "account", "token", "claude", "openai"] {
            assert!(!encoded.contains(private));
        }
    }

    #[test]
    fn errors_keep_known_services_but_disabling_removes_them_and_old_results_cannot_restore() {
        let mut inventory = ServicesInventory::default();
        inventory.record_codex(&missing_codex());
        inventory.record_google(&google(1));
        let mut failure = google(2);
        failure.usage = Usage::Unavailable {
            source: Some(Source::Desktop),
            checked_at: 1_900_000_300,
            reason: antigravity::Failure::Timeout,
        };
        inventory.record_google(&failure);
        assert_eq!(
            inventory.snapshot().unwrap().providers[0].status,
            "unavailable"
        );
        inventory.record_google(&View {
            revision: 3,
            settings: Settings::disabled(),
            usage: Usage::Disabled,
        });
        assert!(inventory.snapshot().unwrap().providers.is_empty());
        assert!(!inventory.record_google(&google(2)));
        assert!(inventory.snapshot().unwrap().providers.is_empty());
    }
}
