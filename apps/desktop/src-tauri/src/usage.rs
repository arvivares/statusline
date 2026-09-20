use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

const WEEKLY_WINDOW_MIN_MINS: u64 = 6 * 24 * 60;
const WEEKLY_WINDOW_MAX_MINS: u64 = 8 * 24 * 60;
const CODEX_LIMIT_ID: &str = "codex";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    pub used_percent: f64,
    pub remaining_percent: f64,
    pub window_duration_mins: u64,
    pub resets_at: i64,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UsageUnavailableReason {
    NoWeeklyWindow,
    NotSignedIn,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum UsageResponse {
    Ready {
        weekly: UsageWindow,
        short_window: Option<UsageWindow>,
        plan: Option<String>,
        account_type: String,
        checked_at: i64,
        limit_count: usize,
    },
    Unavailable {
        reason: UsageUnavailableReason,
        checked_at: i64,
    },
    Error {
        code: String,
        message: String,
        checked_at: i64,
    },
}

impl UsageResponse {
    #[must_use]
    pub fn tray_tooltip(&self) -> String {
        self.tray_tooltip_for_language(crate::localization::language())
    }

    #[must_use]
    pub fn tray_tooltip_for_language(&self, primary: &str) -> String {
        match self {
            Self::Ready { weekly, .. } => {
                crate::localization::text_for_language("Codex · {0}% left", primary)
                    .replace("{0}", &format!("{:.0}", weekly.remaining_percent))
            }
            Self::Unavailable { .. } | Self::Error { .. } => {
                crate::localization::text_for_language("Statusline Companion · no data", primary)
            }
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountReadResult {
    account: Option<Account>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Account {
    #[serde(rename = "type")]
    account_type: String,
    plan_type: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RateLimitsReadResult {
    // Parse only the selected bucket. Unrelated metered services may use a
    // different schema and must not invalidate an otherwise valid Codex quota.
    rate_limits: Option<Value>,
    rate_limits_by_limit_id: Option<BTreeMap<String, Value>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RateLimitSnapshot {
    limit_id: Option<String>,
    limit_name: Option<String>,
    primary: Option<RateLimitWindow>,
    secondary: Option<RateLimitWindow>,
    plan_type: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RateLimitWindow {
    used_percent: f64,
    window_duration_mins: u64,
    resets_at: i64,
}

#[derive(Debug)]
struct LimitCandidate {
    weekly: UsageWindow,
    short_window: Option<UsageWindow>,
    plan: Option<String>,
}

#[must_use]
pub fn normalize_usage(
    account_result: Value,
    rate_limits_result: Value,
    checked_at: i64,
) -> UsageResponse {
    let account_result = match serde_json::from_value::<AccountReadResult>(account_result) {
        Ok(result) => result,
        Err(error) => return invalid_data(error, checked_at),
    };
    let Some(account) = account_result.account else {
        return UsageResponse::Unavailable {
            reason: UsageUnavailableReason::NotSignedIn,
            checked_at,
        };
    };
    let rate_limits = match serde_json::from_value::<RateLimitsReadResult>(rate_limits_result) {
        Ok(result) => result,
        Err(error) => return invalid_data(error, checked_at),
    };

    let (selected, limit_count) = match codex_candidate_from(rate_limits) {
        Ok(result) => result,
        Err(message) => {
            return UsageResponse::Error {
                code: "invalidData".to_owned(),
                message,
                checked_at,
            };
        }
    };
    let Some(selected) = selected else {
        return UsageResponse::Unavailable {
            reason: UsageUnavailableReason::NoWeeklyWindow,
            checked_at,
        };
    };

    UsageResponse::Ready {
        weekly: selected.weekly,
        short_window: selected.short_window,
        plan: account.plan_type.or(selected.plan),
        account_type: account.account_type,
        checked_at,
        limit_count,
    }
}

fn codex_candidate_from(
    rate_limits: RateLimitsReadResult,
) -> Result<(Option<LimitCandidate>, usize), String> {
    let mut by_id = rate_limits.rate_limits_by_limit_id.unwrap_or_default();
    let limit_count = by_id.len();
    // App Server keys this map by metered limit ID. Model-specific or reserve
    // buckets are not the general Codex quota, regardless of their usage/name.
    let selected = by_id.remove(CODEX_LIMIT_ID).or_else(|| {
        rate_limits.rate_limits.filter(|snapshot| {
            // Older servers omit limitId in the compatibility snapshot. An
            // explicit non-Codex ID, however, must never be relabeled as Codex.
            !snapshot["limitId"]
                .as_str()
                .is_some_and(|id| id != CODEX_LIMIT_ID)
        })
    });
    let Some(selected) = selected else {
        return Ok((None, limit_count));
    };
    let snapshot: RateLimitSnapshot = serde_json::from_value(selected)
        .map_err(|error| format!("Could not parse Codex rate-limit data: {error}"))?;
    if snapshot
        .limit_id
        .as_deref()
        .is_some_and(|id| id != CODEX_LIMIT_ID)
    {
        return Err("Codex rate-limit map key and limitId disagree".to_owned());
    }
    // Once selected, malformed/missing Codex windows must surface as such;
    // never silently fall back to another bucket or an older compatibility view.
    Ok((candidate_from("Codex", &snapshot)?, limit_count.max(1)))
}

fn candidate_from(
    fallback_label: &str,
    snapshot: &RateLimitSnapshot,
) -> Result<Option<LimitCandidate>, String> {
    let label = snapshot
        .limit_name
        .as_deref()
        .or(snapshot.limit_id.as_deref())
        .unwrap_or(fallback_label);
    let windows = [snapshot.primary.as_ref(), snapshot.secondary.as_ref()]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();

    for window in &windows {
        validate_window(window)?;
    }

    let weekly = windows
        .iter()
        .copied()
        .filter(|window| is_weekly(window.window_duration_mins))
        .max_by(|left, right| left.used_percent.total_cmp(&right.used_percent));
    let Some(weekly) = weekly else {
        return Ok(None);
    };
    let short_window = windows
        .iter()
        .copied()
        .filter(|window| window.window_duration_mins < WEEKLY_WINDOW_MIN_MINS)
        .min_by_key(|window| window.window_duration_mins)
        .map(|window| view_from(window, label));

    Ok(Some(LimitCandidate {
        weekly: view_from(weekly, label),
        short_window,
        plan: snapshot.plan_type.clone(),
    }))
}

fn validate_window(window: &RateLimitWindow) -> Result<(), String> {
    if !window.used_percent.is_finite() || !(0.0..=100.0).contains(&window.used_percent) {
        return Err(format!(
            "App Server returned usedPercent outside 0..=100: {}",
            window.used_percent
        ));
    }
    if window.window_duration_mins == 0 {
        return Err("App Server returned a zero-minute rate-limit window".to_owned());
    }
    if window.resets_at <= 0 {
        return Err("App Server returned a non-positive reset timestamp".to_owned());
    }
    Ok(())
}

fn is_weekly(duration_mins: u64) -> bool {
    (WEEKLY_WINDOW_MIN_MINS..=WEEKLY_WINDOW_MAX_MINS).contains(&duration_mins)
}

fn view_from(window: &RateLimitWindow, label: &str) -> UsageWindow {
    UsageWindow {
        used_percent: window.used_percent,
        remaining_percent: 100.0 - window.used_percent,
        window_duration_mins: window.window_duration_mins,
        resets_at: window.resets_at,
        label: label.to_owned(),
    }
}

fn invalid_data(error: serde_json::Error, checked_at: i64) -> UsageResponse {
    UsageResponse::Error {
        code: "invalidData".to_owned(),
        message: format!("Could not parse Codex App Server data: {error}"),
        checked_at,
    }
}
