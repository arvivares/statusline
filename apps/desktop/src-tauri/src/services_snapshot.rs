//! Public quota projection only. Vendor responses, credentials and paths never
//! enter this model. A complete inventory replaces the previous inventory.
use serde::{Deserialize, Serialize};

use crate::{antigravity, claude, relay_protocol::UsageSnapshot, usage::UsageResponse};

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
    claude: Option<Option<ProviderSnapshot>>,
    claude_revision: u64,
    updated_at: i64,
    legacy_codex: Option<UsageSnapshot>,
}

impl ServicesInventory {
    pub fn record_claude(&mut self, view: &claude::View) -> bool {
        if view.revision <= self.claude_revision {
            return false;
        }
        self.claude_revision = view.revision;
        // A failed scan is not evidence of uninstall. Complete startup even if
        // discovery fails, but never erase a service from an earlier good scan.
        if view.status == claude::Status::DiscoveryUnavailable && self.claude.is_some() {
            return false;
        }
        let next = if view.installations.detected() {
            Some(unavailable("claude", view.checked_at))
        } else {
            None
        };
        // Scanning an unchanged installation is not a new quota sample and
        // must not create extra relay publications or keep stale quota fresh.
        if self.claude.as_ref().is_some_and(|old| {
            old.as_ref().map(|p| (&p.id, &p.status)) == next.as_ref().map(|p| (&p.id, &p.status))
        }) {
            return false;
        }
        self.claude = Some(next);
        self.updated_at = self.updated_at.max(view.checked_at);
        true
    }

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
        let (codex, google, claude) = (
            self.codex.as_ref()?,
            self.google.as_ref()?,
            self.claude.as_ref()?,
        );
        Some(ServicesSnapshot {
            schema_version: 1,
            updated_at: self.updated_at,
            providers: [codex.clone(), google.clone(), claude.clone()]
                .into_iter()
                .flatten()
                .collect(),
        })
    }

    pub fn codex_projection(&self) -> Option<&UsageSnapshot> {
        self.legacy_codex.as_ref()
    }
}

/// Normalized future Claude transport boundary. Not called by passive discovery.
/// Do not publish this projection until a real, fresh source has been validated.
pub fn claude_quota_projection(sample: &claude::QuotaSample) -> ProviderSnapshot {
    ProviderSnapshot {
        id: "claude".into(),
        status: "ready".into(),
        updated_at: sample.checked_at,
        weekly: sample
            .weekly
            .as_ref()
            .map(|w| QuotaWindow::new(w.remaining_percent, w.resets_at, 10080)),
        short_window: sample
            .short_window
            .as_ref()
            .map(|w| QuotaWindow::new(w.remaining_percent, w.resets_at, 300)),
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

    fn claude_view(revision: u64, detected: bool) -> claude::View {
        claude::View {
            revision,
            checked_at: 1_900_000_000 + revision as i64,
            installations: claude::Installations {
                cli: detected,
                desktop: false,
            },
            status: if detected {
                claude::Status::QuotaUnavailable
            } else {
                claude::Status::NotFound
            },
        }
    }

    #[test]
    fn startup_waits_for_all_collectors_and_google_only_does_not_invent_codex() {
        let mut inventory = ServicesInventory::default();
        inventory.record_google(&google(1));
        assert!(inventory.snapshot().is_none());
        inventory.record_codex(&missing_codex());
        assert!(inventory.snapshot().is_none());
        inventory.record_claude(&claude_view(1, false));
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
        inventory.record_claude(&claude_view(1, false));
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

    #[test]
    fn claude_presence_is_additive_never_publishes_quota_and_uninstall_removes_it() {
        let mut inventory = ServicesInventory::default();
        inventory.record_codex(&missing_codex());
        inventory.record_google(&google(1));
        inventory.record_claude(&claude_view(1, true));
        let before = inventory.snapshot().unwrap();
        assert_eq!(
            before
                .providers
                .iter()
                .map(|p| p.id.as_str())
                .collect::<Vec<_>>(),
            ["antigravity", "claude"]
        );
        assert_eq!(before.providers[1].status, "unavailable");
        assert!(before.providers[1].weekly.is_none());
        assert!(before.providers[1].short_window.is_none());
        assert!(inventory.codex_projection().is_none());
        assert!(!inventory.record_claude(&claude_view(2, true)));
        assert_eq!(inventory.snapshot().unwrap(), before);
        assert!(inventory.record_claude(&claude_view(3, false)));
        assert!(!inventory.record_claude(&claude_view(2, true)));
        assert_eq!(
            inventory.snapshot().unwrap().providers,
            vec![before.providers[0].clone()]
        );
    }

    #[test]
    fn failed_claude_scan_completes_startup_without_erasing_known_service() {
        let mut inventory = ServicesInventory::default();
        let mut failure = claude_view(1, false);
        failure.status = claude::Status::DiscoveryUnavailable;
        inventory.record_claude(&failure);
        inventory.record_codex(&missing_codex());
        inventory.record_google(&google(1));
        assert!(inventory.snapshot().is_some());
        inventory.record_claude(&claude_view(2, true));
        let before = inventory.snapshot().unwrap();
        failure.revision = 3;
        assert!(!inventory.record_claude(&failure));
        assert_eq!(inventory.snapshot().unwrap(), before);
    }

    #[test]
    fn claude_fixture_maps_to_existing_contract_without_changing_legacy_codex() {
        let sample = claude::parse_statusline(
            include_bytes!("../../../../protocol/fixtures/claude-statusline.json"),
            1_900_000_000,
        )
        .unwrap()
        .unwrap();
        let projection = claude_quota_projection(&sample);
        assert_eq!(projection.id, "claude");
        assert_eq!(projection.weekly.as_ref().unwrap().window_minutes, 10080);
        assert_eq!(
            projection.short_window.as_ref().unwrap().window_minutes,
            300
        );
        assert_eq!(
            projection
                .short_window
                .as_ref()
                .unwrap()
                .remaining_percentage,
            75
        );
        let mut inventory = ServicesInventory::default();
        let codex = crate::usage::normalize_usage(
            serde_json::json!({"account": {"type": "chatgpt", "planType": "plus"}}),
            serde_json::json!({"rateLimits": {"primary": {
                "usedPercent": 47, "windowDurationMins": 10080, "resetsAt": 1900604800
            }}}),
            1_900_000_000,
        );
        inventory.record_codex(&codex);
        assert!(inventory.codex_projection().is_some());
        let legacy_before = serde_json::to_string(&inventory.codex_projection()).unwrap();
        inventory.record_claude(&claude_view(1, true));
        inventory.record_claude(&claude_view(2, false));
        assert_eq!(
            serde_json::to_string(&inventory.codex_projection()).unwrap(),
            legacy_before
        );
    }
}
