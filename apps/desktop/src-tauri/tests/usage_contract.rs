use serde_json::json;
use statusline_desktop_lib::usage::{
    UsageResponse, UsageUnavailableReason, UsageWindow, normalize_usage,
};

#[test]
fn normalize_usage_uses_the_most_constrained_weekly_bucket_from_the_limit_map() {
    let account = json!({
        "account": { "type": "chatgpt", "email": "private@example.com", "planType": "plus" },
        "requiresOpenaiAuth": true
    });
    let rate_limits = json!({
        "rateLimits": {
            "limitId": "legacy",
            "primary": { "usedPercent": 5, "windowDurationMins": 300, "resetsAt": 2_000_000_000 },
            "secondary": { "usedPercent": 9, "windowDurationMins": 10_080, "resetsAt": 2_000_500_000 }
        },
        "rateLimitsByLimitId": {
            "codex": {
                "limitId": "codex",
                "limitName": "Codex",
                "planType": "plus",
                "primary": { "usedPercent": 12, "windowDurationMins": 300, "resetsAt": 2_000_000_000 },
                "secondary": { "usedPercent": 34, "windowDurationMins": 10_080, "resetsAt": 2_000_500_000 }
            },
            "codex_spark": {
                "limitId": "codex_spark",
                "limitName": "Codex Spark",
                "primary": { "usedPercent": 18, "windowDurationMins": 300, "resetsAt": 2_000_100_000 },
                "secondary": { "usedPercent": 71, "windowDurationMins": 10_080, "resetsAt": 2_000_600_000 }
            }
        }
    });

    let result = normalize_usage(account, rate_limits, 1_900_000_000);

    let UsageResponse::Ready { weekly, .. } = result else {
        panic!("expected a ready usage response");
    };
    assert_eq!(weekly.used_percent, 71.0);
}

#[test]
fn normalize_usage_pairs_the_short_window_with_the_selected_weekly_bucket() {
    let account = json!({
        "account": { "type": "chatgpt", "planType": "plus" },
        "requiresOpenaiAuth": true
    });
    let rate_limits = json!({
        "rateLimitsByLimitId": {
            "codex": {
                "limitId": "codex",
                "primary": { "usedPercent": 12, "windowDurationMins": 300, "resetsAt": 2_000_000_000 },
                "secondary": { "usedPercent": 34, "windowDurationMins": 10_080, "resetsAt": 2_000_500_000 }
            },
            "codex_spark": {
                "limitId": "codex_spark",
                "primary": { "usedPercent": 18, "windowDurationMins": 300, "resetsAt": 2_000_100_000 },
                "secondary": { "usedPercent": 71, "windowDurationMins": 10_080, "resetsAt": 2_000_600_000 }
            }
        }
    });

    let result = normalize_usage(account, rate_limits, 1_900_000_000);

    let UsageResponse::Ready { short_window, .. } = result else {
        panic!("expected a ready usage response");
    };
    assert_eq!(short_window.map(|window| window.used_percent), Some(18.0));
}

#[test]
fn normalize_usage_falls_back_to_the_compatibility_snapshot_for_older_servers() {
    let account = json!({
        "account": { "type": "chatgpt", "planType": "team" },
        "requiresOpenaiAuth": true
    });
    let rate_limits = json!({
        "rateLimits": {
            "limitId": "codex",
            "primary": { "usedPercent": 7.5, "windowDurationMins": 300, "resetsAt": 2_000_000_000 },
            "secondary": { "usedPercent": 42.5, "windowDurationMins": 10_080, "resetsAt": 2_000_500_000 }
        },
        "rateLimitsByLimitId": null
    });

    let result = normalize_usage(account, rate_limits, 1_900_000_000);

    let UsageResponse::Ready { weekly, .. } = result else {
        panic!("expected a ready usage response");
    };
    assert_eq!(weekly.remaining_percent, 57.5);
}

#[test]
fn normalize_usage_does_not_mislabel_a_short_window_as_weekly() {
    let account = json!({
        "account": { "type": "chatgpt", "planType": "plus" },
        "requiresOpenaiAuth": true
    });
    let rate_limits = json!({
        "rateLimitsByLimitId": {
            "codex": {
                "limitId": "codex",
                "primary": { "usedPercent": 12, "windowDurationMins": 300, "resetsAt": 2_000_000_000 },
                "secondary": null
            }
        }
    });

    let result = normalize_usage(account, rate_limits, 1_900_000_000);

    assert_eq!(
        result,
        UsageResponse::Unavailable {
            reason: UsageUnavailableReason::NoWeeklyWindow,
            checked_at: 1_900_000_000,
        }
    );
}

#[test]
fn normalize_usage_rejects_percentages_outside_the_documented_range() {
    let account = json!({
        "account": { "type": "chatgpt", "planType": "plus" },
        "requiresOpenaiAuth": true
    });
    let rate_limits = json!({
        "rateLimitsByLimitId": {
            "codex": {
                "limitId": "codex",
                "secondary": { "usedPercent": 135, "windowDurationMins": 10_080, "resetsAt": 2_000_500_000 }
            }
        }
    });

    let result = normalize_usage(account, rate_limits, 1_900_000_000);

    let UsageResponse::Error { code, .. } = result else {
        panic!("expected an invalid-data error");
    };
    assert_eq!(code, "invalidData");
}

#[test]
fn usage_response_serializes_the_frontend_contract_without_account_email() {
    let account = json!({
        "account": { "type": "chatgpt", "email": "private@example.com", "planType": "plus" },
        "requiresOpenaiAuth": true
    });
    let rate_limits = json!({
        "rateLimitsByLimitId": {
            "codex": {
                "limitId": "codex",
                "limitName": "Codex",
                "primary": { "usedPercent": 12, "windowDurationMins": 300, "resetsAt": 2_000_000_000 },
                "secondary": { "usedPercent": 34, "windowDurationMins": 10_080, "resetsAt": 2_000_500_000 }
            }
        }
    });

    let result = normalize_usage(account, rate_limits, 1_900_000_000);
    let serialized = serde_json::to_value(result).expect("usage response should serialize");

    assert_eq!(
        serialized,
        json!({
            "status": "ready",
            "weekly": {
                "usedPercent": 34.0,
                "remainingPercent": 66.0,
                "windowDurationMins": 10_080,
                "resetsAt": 2_000_500_000,
                "label": "Codex"
            },
            "shortWindow": {
                "usedPercent": 12.0,
                "remainingPercent": 88.0,
                "windowDurationMins": 300,
                "resetsAt": 2_000_000_000,
                "label": "Codex"
            },
            "plan": "plus",
            "accountType": "chatgpt",
            "checkedAt": 1_900_000_000,
            "limitCount": 1
        })
    );
}

#[test]
fn tray_tooltip_reports_rounded_weekly_remaining_percentage() {
    let response = UsageResponse::Ready {
        weekly: UsageWindow {
            used_percent: 33.6,
            remaining_percent: 66.4,
            window_duration_mins: 10_080,
            resets_at: 2_000_500_000,
            label: "Codex".to_owned(),
        },
        short_window: None,
        plan: Some("plus".to_owned()),
        account_type: "chatgpt".to_owned(),
        checked_at: 1_900_000_000,
        limit_count: 1,
    };

    assert_eq!(
        response.tray_tooltip_for_language("en-US"),
        "Codex · 66% left"
    );
    assert_eq!(
        response.tray_tooltip_for_language("es-MX"),
        "Codex · 66% libre"
    );
    assert_eq!(
        response.tray_tooltip_for_language("fr-FR"),
        "Codex · 66% left"
    );
}

#[test]
fn tray_tooltip_does_not_expose_backend_error_details() {
    let response = UsageResponse::Error {
        code: "appServer".to_owned(),
        message: "private filesystem path".to_owned(),
        checked_at: 1_900_000_000,
    };

    assert_eq!(
        response.tray_tooltip_for_language("en-US"),
        "Statusline Companion · no data"
    );
    assert_eq!(
        response.tray_tooltip_for_language("es-ES"),
        "Statusline Companion · sin datos"
    );
    assert_eq!(
        response.tray_tooltip_for_language("de-DE"),
        "Statusline Companion · no data"
    );
}
