use serde_json::json;
use statusline_desktop_lib::usage::{
    UsageResponse, UsageUnavailableReason, UsageWindow, normalize_usage,
};

fn signed_in_account() -> serde_json::Value {
    json!({"account": {"type": "chatgpt", "planType": "plus"}})
}

fn quota_bucket(id: &str, used: f64) -> serde_json::Value {
    json!({
        "limitId": id,
        "primary": { "usedPercent": 12, "windowDurationMins": 300, "resetsAt": 2_000_000_000 },
        "secondary": { "usedPercent": used, "windowDurationMins": 10_080, "resetsAt": 2_000_500_000 }
    })
}

#[test]
fn exhausted_reserve_never_replaces_codex_or_its_short_window() {
    let mut reserve = quota_bucket("base_model_inference", 100.0);
    reserve["limitName"] = json!("gpt-reserve");
    reserve["primary"]["usedPercent"] = json!(100);
    reserve["secondary"]["resetsAt"] = json!(2_000_600_000);
    let result = normalize_usage(
        signed_in_account(),
        json!({
            "rateLimits": reserve,
            "rateLimitsByLimitId": {
                "base_model_inference": reserve,
                "codex": quota_bucket("codex", 34.0)
            }
        }),
        1_900_000_000,
    );
    let UsageResponse::Ready {
        weekly,
        short_window,
        limit_count,
        ..
    } = result
    else {
        panic!("expected Codex quota despite exhausted reserve");
    };
    assert_eq!(weekly.remaining_percent, 66.0);
    assert_eq!(weekly.resets_at, 2_000_500_000);
    assert_eq!(short_window.unwrap().remaining_percent, 88.0);
    assert_eq!(limit_count, 2);
}

#[test]
fn genuinely_exhausted_codex_stays_zero_despite_other_available_buckets() {
    let result = normalize_usage(
        signed_in_account(),
        json!({"rateLimitsByLimitId": {
            "codex": quota_bucket("codex", 100.0),
            "base_model_inference": quota_bucket("base_model_inference", 10.0)
        }}),
        1_900_000_000,
    );
    let UsageResponse::Ready { weekly, .. } = result else {
        panic!("expected exhausted Codex quota");
    };
    assert_eq!(weekly.remaining_percent, 0.0);
}

#[test]
fn codex_map_key_is_sufficient_when_snapshot_id_is_missing() {
    let mut codex = quota_bucket("codex", 34.0);
    codex.as_object_mut().unwrap().remove("limitId");
    codex["limitName"] = json!("A future display name");
    let result = normalize_usage(
        signed_in_account(),
        json!({"rateLimitsByLimitId": {"codex": codex}}),
        1_900_000_000,
    );
    let UsageResponse::Ready { weekly, .. } = result else {
        panic!("expected quota identified by the map key, not its display name");
    };
    assert_eq!(weekly.remaining_percent, 66.0);
}

#[test]
fn compatibility_codex_is_used_when_the_map_has_no_codex_entry() {
    for map in [
        serde_json::Value::Null,
        json!({}),
        json!({"base_model_inference": quota_bucket("base_model_inference", 100.0)}),
    ] {
        for limit_id in [json!("codex"), serde_json::Value::Null] {
            let mut compatibility = quota_bucket("codex", 42.5);
            compatibility["limitId"] = limit_id;
            let result = normalize_usage(
                signed_in_account(),
                json!({"rateLimits": compatibility, "rateLimitsByLimitId": map}),
                1_900_000_000,
            );
            let UsageResponse::Ready { weekly, .. } = result else {
                panic!("expected compatible Codex snapshot");
            };
            assert_eq!(weekly.remaining_percent, 57.5);
        }
    }
    // Old servers may omit both the map and the snapshot ID entirely.
    let mut compatibility = quota_bucket("codex", 42.5);
    compatibility.as_object_mut().unwrap().remove("limitId");
    assert!(matches!(
        normalize_usage(
            signed_in_account(),
            json!({"rateLimits": compatibility}),
            1_900_000_000
        ),
        UsageResponse::Ready { .. }
    ));
}

#[test]
fn other_buckets_are_never_relabelled_as_codex_even_if_the_display_name_matches() {
    for id in ["base_model_inference", "codex_spark", "future_limit"] {
        let mut other = quota_bucket(id, 100.0);
        other["limitName"] = json!("Codex");
        for response in [
            json!({"rateLimitsByLimitId": {id: other}}),
            json!({"rateLimits": other}),
            json!({"rateLimits": other, "rateLimitsByLimitId": {id: other}}),
        ] {
            assert_eq!(
                normalize_usage(signed_in_account(), response, 1_900_000_000),
                UsageResponse::Unavailable {
                    reason: UsageUnavailableReason::NoWeeklyWindow,
                    checked_at: 1_900_000_000,
                }
            );
        }
    }
}

#[test]
fn unrelated_buckets_and_compatibility_schema_cannot_invalidate_selected_codex() {
    for other in [
        json!({"primary": "future format"}),
        serde_json::Value::Null,
        quota_bucket("base_model_inference", 135.0),
    ] {
        let result = normalize_usage(
            signed_in_account(),
            json!({
                "rateLimits": other,
                "rateLimitsByLimitId": {"codex": quota_bucket("codex", 34.0), "future": other}
            }),
            1_900_000_000,
        );
        let UsageResponse::Ready { weekly, .. } = result else {
            panic!("expected independent Codex quota");
        };
        assert_eq!(weekly.remaining_percent, 66.0);
    }
}

#[test]
fn invalid_selected_codex_never_falls_back_to_other_or_compatibility_quota() {
    for invalid in [
        quota_bucket("codex", 135.0),
        quota_bucket("base_model_inference", 100.0),
        json!({"limitId": "codex", "secondary": "invalid"}),
        serde_json::Value::Null,
    ] {
        let result = normalize_usage(
            signed_in_account(),
            json!({
                "rateLimits": quota_bucket("codex", 34.0),
                "rateLimitsByLimitId": {
                    "codex": invalid,
                    "codex_spark": quota_bucket("codex_spark", 71.0)
                }
            }),
            1_900_000_000,
        );
        let UsageResponse::Error { code, .. } = result else {
            panic!("expected invalid selected Codex data");
        };
        assert_eq!(code, "invalidData");
    }
}

#[test]
fn missing_codex_weekly_window_does_not_borrow_another_bucket_or_compatibility_view() {
    let mut codex = quota_bucket("codex", 34.0);
    codex["secondary"] = serde_json::Value::Null;
    let result = normalize_usage(
        signed_in_account(),
        json!({
            "rateLimits": quota_bucket("codex", 34.0),
            "rateLimitsByLimitId": {
                "codex": codex,
                "codex_spark": quota_bucket("codex_spark", 71.0)
            }
        }),
        1_900_000_000,
    );
    assert_eq!(
        result,
        UsageResponse::Unavailable {
            reason: UsageUnavailableReason::NoWeeklyWindow,
            checked_at: 1_900_000_000,
        }
    );
}

#[test]
fn normalize_usage_selects_codex_instead_of_the_most_constrained_bucket() {
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
    assert_eq!(weekly.used_percent, 34.0);
    assert_eq!(weekly.remaining_percent, 66.0);
    assert_eq!(weekly.label, "Codex");
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
    let short_window = short_window.expect("Codex short window");
    assert_eq!(short_window.used_percent, 12.0);
    assert_eq!(short_window.resets_at, 2_000_000_000);
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
