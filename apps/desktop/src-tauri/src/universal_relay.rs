use std::{
    collections::HashSet,
    env,
    path::{Path, PathBuf},
    time::Duration,
};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use reqwest::{Client, StatusCode, Url, redirect::Policy};
use ring::{
    digest,
    rand::{SecureRandom, SystemRandom},
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use tokio::{
    sync::{Mutex, Notify},
    task,
};
use uuid::Uuid;

use crate::{
    antigravity,
    relay_protocol::{
        ChannelMetadata, CreateChannelResponse, PROTOCOL_VERSION, ProtocolError,
        PublisherCredentials, SERVICES_CAPABILITY, ServicesPublication, SnapshotEnvelope,
        encrypt_services, encrypt_snapshot, validate_channel_metadata,
    },
    services_snapshot::{ServicesInventory, ServicesSnapshot},
    usage::UsageResponse,
};

const KEYRING_SERVICE: &str = "inmerzion.statusline.relay";
const KEYRING_ACCOUNT: &str = "universal-publisher-v1";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_RESPONSE_BYTES: usize = 64 * 1024;
const RESET_PUSH_STATE_FILE: &str = "codex-reset-push-v1.json";
const MAX_TRACKED_RESET_IDS: usize = 1_024;
const MAX_PENDING_RESET_EVENTS: usize = 64;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum RelayStatus {
    NotConfigured,
    Unpaired {
        endpoint: String,
    },
    Creating {
        endpoint: String,
    },
    Pairing {
        endpoint: String,
        pairing_uri: String,
        pairing_expires_at: i64,
        last_published_at: Option<i64>,
        services_published_at: Option<i64>,
    },
    Connected {
        endpoint: String,
        last_published_at: Option<i64>,
        services_published_at: Option<i64>,
    },
    Error {
        endpoint: Option<String>,
        code: String,
        message: String,
        has_pairing: bool,
    },
}

#[derive(Clone, Debug)]
struct RelayConfiguration {
    base_url: Url,
    origin: String,
}

impl RelayConfiguration {
    fn load() -> Option<Result<Self, RelayError>> {
        runtime_or_build_value(
            "STATUSLINE_RELAY_BASE_URL",
            option_env!("STATUSLINE_RELAY_BASE_URL"),
        )
        .map(|value| Self::parse(&value))
    }

    fn parse(raw: &str) -> Result<Self, RelayError> {
        let mut base_url = Url::parse(raw).map_err(|_| RelayError::InvalidConfiguration)?;
        let is_https = base_url.scheme() == "https";
        let is_local_debug = cfg!(debug_assertions)
            && base_url.scheme() == "http"
            && base_url.host_str().is_some_and(is_loopback_host);
        if (!is_https && !is_local_debug)
            || base_url.host_str().is_none()
            || !base_url.username().is_empty()
            || base_url.password().is_some()
            || base_url.query().is_some()
            || base_url.fragment().is_some()
        {
            return Err(RelayError::InvalidConfiguration);
        }
        base_url.set_path("/");
        let origin = base_url.as_str().trim_end_matches('/').to_owned();
        Ok(Self { base_url, origin })
    }

    fn endpoint(&self, path: &str) -> Result<Url, RelayError> {
        self.base_url
            .join(path.trim_start_matches('/'))
            .map_err(|_| RelayError::InvalidConfiguration)
    }
}

#[derive(Debug, thiserror::Error)]
enum RelayError {
    #[error("The universal relay URL is invalid. Use an HTTPS origin.")]
    InvalidConfiguration,
    #[error("Could not reach the universal relay.")]
    Transport,
    #[error("The universal relay returned an invalid response.")]
    InvalidResponse,
    #[error("The relay rejected this request: {message}")]
    Server { code: String, message: String },
    #[error("The secure credential store is unavailable.")]
    SecureStorage,
    #[error("This pairing belongs to a different relay endpoint.")]
    EndpointMismatch,
    #[error(transparent)]
    Protocol(#[from] ProtocolError),
}

impl RelayError {
    fn code(&self) -> &str {
        match self {
            Self::InvalidConfiguration => "invalidConfiguration",
            Self::Transport => "networkUnavailable",
            Self::InvalidResponse => "invalidResponse",
            Self::Server { code, .. } => code,
            Self::SecureStorage => "secureStorageUnavailable",
            Self::EndpointMismatch => "endpointMismatch",
            Self::Protocol(ProtocolError::SecureRandom) => "secureRandomUnavailable",
            Self::Protocol(ProtocolError::Encryption) => "encryptionFailed",
            Self::Protocol(ProtocolError::InvalidClock) => "invalidSystemClock",
            Self::Protocol(_) => "invalidProtocolData",
        }
    }
}

#[derive(Debug, Deserialize)]
struct APIErrorEnvelope {
    error: APIErrorBody,
}

#[derive(Debug, Deserialize)]
struct APIErrorBody {
    code: String,
    message: String,
}

struct RelayClient {
    http: Client,
}

impl Default for RelayClient {
    fn default() -> Self {
        let http = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .redirect(Policy::none())
            .user_agent(concat!("Statusline-Companion/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("the embedded relay HTTP client configuration must be valid");
        Self { http }
    }
}

#[allow(async_fn_in_trait)]
trait StatusPublisher {
    async fn publish_snapshot(
        &self,
        configuration: &RelayConfiguration,
        credentials: &PublisherCredentials,
        envelope: &SnapshotEnvelope,
    ) -> Result<(), RelayError>;
}

impl StatusPublisher for RelayClient {
    async fn publish_snapshot(
        &self,
        configuration: &RelayConfiguration,
        credentials: &PublisherCredentials,
        envelope: &SnapshotEnvelope,
    ) -> Result<(), RelayError> {
        let url =
            configuration.endpoint(&format!("v1/channels/{}/snapshot", credentials.channel_id))?;
        let response = self
            .http
            .put(url)
            .bearer_auth(&credentials.publisher_token)
            .json(envelope)
            .send()
            .await
            .map_err(|_| RelayError::Transport)?;
        ensure_empty_success(response, &[StatusCode::CREATED, StatusCode::NO_CONTENT]).await
    }
}

impl RelayClient {
    async fn publish_services(
        &self,
        configuration: &RelayConfiguration,
        credentials: &PublisherCredentials,
        publication: &ServicesPublication,
    ) -> Result<(), RelayError> {
        let response = self
            .http
            .put(
                configuration
                    .endpoint(&format!("v1/channels/{}/services", credentials.channel_id))?,
            )
            .bearer_auth(&credentials.publisher_token)
            .json(publication)
            .send()
            .await
            .map_err(|_| RelayError::Transport)?;
        ensure_empty_success(response, &[StatusCode::CREATED, StatusCode::NO_CONTENT]).await
    }

    async fn send_reset_credit_event(
        &self,
        configuration: &RelayConfiguration,
        credentials: &PublisherCredentials,
        event_id: &str,
    ) -> Result<(), RelayError> {
        let response = self
            .http
            .post(configuration.endpoint(&format!(
                "v1/channels/{}/reset-credit-events",
                credentials.channel_id
            ))?)
            .bearer_auth(&credentials.publisher_token)
            .json(&serde_json::json!({ "eventId": event_id }))
            .send()
            .await
            .map_err(|_| RelayError::Transport)?;
        ensure_empty_success(response, &[StatusCode::NO_CONTENT]).await
    }

    async fn create_channel(
        &self,
        configuration: &RelayConfiguration,
    ) -> Result<CreateChannelResponse, RelayError> {
        let response = self
            .http
            .post(configuration.endpoint("v1/channels")?)
            .send()
            .await
            .map_err(|_| RelayError::Transport)?;
        decode_json_success(response, StatusCode::CREATED).await
    }

    async fn metadata(
        &self,
        configuration: &RelayConfiguration,
        credentials: &PublisherCredentials,
    ) -> Result<ChannelMetadata, RelayError> {
        let response = self
            .http
            .get(configuration.endpoint(&format!("v1/channels/{}", credentials.channel_id))?)
            .bearer_auth(&credentials.publisher_token)
            .send()
            .await
            .map_err(|_| RelayError::Transport)?;
        decode_json_success(response, StatusCode::OK).await
    }

    async fn delete_channel(
        &self,
        configuration: &RelayConfiguration,
        credentials: &PublisherCredentials,
    ) -> Result<(), RelayError> {
        let response = self
            .http
            .delete(configuration.endpoint(&format!("v1/channels/{}", credentials.channel_id))?)
            .bearer_auth(&credentials.publisher_token)
            .send()
            .await
            .map_err(|_| RelayError::Transport)?;
        ensure_empty_success(response, &[StatusCode::NO_CONTENT, StatusCode::NOT_FOUND]).await
    }
}

#[derive(Default)]
pub struct UniversalRelayState {
    client: RelayClient,
    operation_lock: Mutex<()>,
    inventory: Mutex<ServicesInventory>,
    publication_requested: Notify,
    last_publication: Mutex<Option<(String, ServicesSnapshot)>>,
    reset_push: ResetPushTracker,
}

impl UniversalRelayState {
    pub async fn record_claude(&self, view: &crate::claude::View) {
        if self.inventory.lock().await.record_claude(view) {
            self.publication_requested.notify_one();
        }
    }

    pub async fn record_codex(&self, usage: &UsageResponse) {
        let inventory_changed = self.inventory.lock().await.record_codex(usage);
        let reset_added = self.reset_push.observe(usage).await;
        if inventory_changed || reset_added || self.reset_push.has_pending().await {
            self.publication_requested.notify_one();
        }
    }

    pub async fn configure_reset_push_tracking(&self, app_config_dir: &Path) {
        self.reset_push.configure(app_config_dir).await;
    }

    pub async fn record_google(&self, view: &antigravity::View) {
        if self.inventory.lock().await.record_google(view) {
            self.publication_requested.notify_one();
        }
    }

    pub async fn wait_for_publication(&self) {
        self.publication_requested.notified().await;
    }

    /// A short native coalescing window combines independently collected quotas.
    /// A slow Google collector never holds Codex's collection or UI lock.
    pub async fn publish_inventory(&self) -> RelayStatus {
        let configuration = match configured_relay() {
            Ok(Some(value)) => value,
            Ok(None) => return RelayStatus::NotConfigured,
            Err(error) => return error_status(None, &error, false),
        };
        let _guard = self.operation_lock.lock().await;
        let result = self.publish_inventory_locked(&configuration).await;
        result.unwrap_or_else(|error| error_status(Some(&configuration), &error, true))
    }

    async fn publish_inventory_locked(
        &self,
        configuration: &RelayConfiguration,
    ) -> Result<RelayStatus, RelayError> {
        let Some(mut credentials) = load_credentials().await? else {
            return Ok(RelayStatus::Unpaired {
                endpoint: configuration.origin.clone(),
            });
        };
        ensure_matching_endpoint(configuration, &credentials)?;
        let (snapshot, codex) = {
            let inventory = self.inventory.lock().await;
            (inventory.snapshot(), inventory.codex_projection().cloned())
        };
        let Some(snapshot) = snapshot else {
            // No authoritative inventory until both collectors have returned.
            return status_for_credentials(configuration, &credentials);
        };
        let snapshot_changed =
            !self
                .last_publication
                .lock()
                .await
                .as_ref()
                .is_some_and(|(channel, previous)| {
                    *channel == credentials.channel_id && *previous == snapshot
                });
        // Uses the existing authenticated metadata request, not a health poll.
        let metadata = refresh_claim_state(&self.client, configuration, &mut credentials).await?;
        if snapshot_changed {
            let sequence = credentials.next_sequence()?;
            if metadata
                .capabilities
                .iter()
                .any(|value| value == SERVICES_CAPABILITY)
            {
                let services = encrypt_services(&snapshot, &credentials, sequence)?;
                let codex = codex
                    .as_ref()
                    .map(|value| encrypt_snapshot(value, &credentials, sequence))
                    .transpose()?;
                self.client
                    .publish_services(
                        configuration,
                        &credentials,
                        &ServicesPublication { services, codex },
                    )
                    .await?;
                credentials.last_services_published_at = Some(snapshot.updated_at);
            } else if let Some(codex) = &codex {
                // Self-hosted/older relays keep working with their original payload.
                let envelope = encrypt_snapshot(codex, &credentials, sequence)?;
                self.client
                    .publish_snapshot(configuration, &credentials, &envelope)
                    .await?;
                credentials.last_services_published_at = None;
            }
            credentials.last_sequence = Some(sequence);
            credentials.last_published_at = Some(snapshot.updated_at);
            *self.last_publication.lock().await = Some((credentials.channel_id.clone(), snapshot));
        }

        if metadata
            .capabilities
            .iter()
            .any(|value| value == crate::relay_protocol::RESET_PUSH_CAPABILITY)
        {
            for event_id in self.reset_push.pending().await {
                if self
                    .client
                    .send_reset_credit_event(configuration, &credentials, &event_id)
                    .await
                    .is_ok()
                {
                    self.reset_push.complete(&event_id).await;
                }
            }
        }

        let status = status_for_credentials(configuration, &credentials)?;
        save_credentials(credentials).await?;
        Ok(status)
    }

    pub async fn current_status(&self) -> RelayStatus {
        let configuration = match configured_relay() {
            Ok(Some(configuration)) => configuration,
            Ok(None) => return RelayStatus::NotConfigured,
            Err(error) => return error_status(None, &error, false),
        };
        let _guard = self.operation_lock.lock().await;
        match self.status_with_configuration(&configuration).await {
            Ok(status) => status,
            Err(error) => {
                let has_pairing = load_credentials().await.ok().flatten().is_some();
                error_status(Some(&configuration), &error, has_pairing)
            }
        }
    }

    pub async fn create_pairing(&self) -> RelayStatus {
        let configuration = match configured_relay() {
            Ok(Some(configuration)) => configuration,
            Ok(None) => return RelayStatus::NotConfigured,
            Err(error) => return error_status(None, &error, false),
        };
        let _guard = self.operation_lock.lock().await;

        if let Ok(Some(existing)) = load_credentials().await
            && existing.relay_origin == configuration.origin
        {
            let _ = self.client.delete_channel(&configuration, &existing).await;
        }
        let result = async {
            let response = self.client.create_channel(&configuration).await?;
            let credentials =
                PublisherCredentials::from_created(configuration.origin.clone(), response)?;
            let status = pairing_status(&configuration, &credentials)?;
            save_credentials(credentials).await?;
            self.publication_requested.notify_one();
            Ok::<_, RelayError>(status)
        }
        .await;
        result.unwrap_or_else(|error| error_status(Some(&configuration), &error, false))
    }

    pub async fn disconnect(&self) -> RelayStatus {
        let configuration = configured_relay().ok().flatten();
        let _guard = self.operation_lock.lock().await;
        let existing = load_credentials().await.ok().flatten();
        if let (Some(configuration), Some(credentials)) = (&configuration, &existing)
            && credentials.relay_origin == configuration.origin
        {
            let _ = self.client.delete_channel(configuration, credentials).await;
        }
        self.reset_push.clear().await;
        match delete_credentials().await {
            Ok(()) => configuration.map_or(RelayStatus::NotConfigured, |configuration| {
                RelayStatus::Unpaired {
                    endpoint: configuration.origin,
                }
            }),
            Err(error) => error_status(configuration.as_ref(), &error, existing.is_some()),
        }
    }

    async fn status_with_configuration(
        &self,
        configuration: &RelayConfiguration,
    ) -> Result<RelayStatus, RelayError> {
        let Some(mut credentials) = load_credentials().await? else {
            return Ok(RelayStatus::Unpaired {
                endpoint: configuration.origin.clone(),
            });
        };
        ensure_matching_endpoint(configuration, &credentials)?;
        refresh_claim_state(&self.client, configuration, &mut credentials).await?;
        let status = status_for_credentials(configuration, &credentials)?;
        save_credentials(credentials).await?;
        Ok(status)
    }
}

#[derive(Default)]
struct ResetPushTracker {
    state: Mutex<ResetPushState>,
    state_path: Mutex<Option<PathBuf>>,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResetPushState {
    schema_version: u8,
    baseline_established: bool,
    salt: String,
    reset_id_hashes: Vec<String>,
    pending_event_ids: Vec<String>,
}

impl ResetPushTracker {
    async fn configure(&self, directory: &Path) {
        let path = directory.join(RESET_PUSH_STATE_FILE);
        let mut state = self.state.lock().await;
        if let Ok(metadata) = tokio::fs::metadata(&path).await
            && metadata.len() <= 64 * 1_024
            && let Ok(bytes) = tokio::fs::read(&path).await
            && let Ok(loaded) = serde_json::from_slice::<ResetPushState>(&bytes)
            && loaded.schema_version == 1
            && loaded.reset_id_hashes.len() <= MAX_TRACKED_RESET_IDS
            && loaded.pending_event_ids.len() <= MAX_PENDING_RESET_EVENTS
            && decode_tracker_salt(&loaded.salt).is_some()
        {
            *state = loaded;
        }
        *self.state_path.lock().await = Some(path);
    }

    async fn observe(&self, usage: &UsageResponse) -> bool {
        let UsageResponse::Ready {
            reset_credits: Some(summary),
            ..
        } = usage
        else {
            return false;
        };
        let Some(credits) = summary.credits.as_ref() else {
            return false;
        };
        // The wire reader caps detail at 16 entries. A count mismatch means the
        // ID set is partial, so it must not establish a baseline or trigger an alert.
        if summary.available_count < 0
            || summary.available_count as usize != credits.len()
            || credits.iter().any(|credit| credit.id.is_empty())
        {
            return false;
        }
        let mut state = self.state.lock().await;
        if state.salt.is_empty() {
            let mut salt = [0_u8; 16];
            if SystemRandom::new().fill(&mut salt).is_err() {
                return false;
            }
            state.salt = URL_SAFE_NO_PAD.encode(salt);
        }
        state.schema_version = 1;
        let Some(salt) = decode_tracker_salt(&state.salt) else {
            *state = ResetPushState::default();
            return false;
        };
        let known: HashSet<String> = state.reset_id_hashes.iter().cloned().collect();
        let hashes = credits
            .iter()
            .map(|credit| hash_reset_id(&salt, &credit.id))
            .collect::<Vec<_>>();
        let has_new = state.baseline_established && hashes.iter().any(|hash| !known.contains(hash));
        let mut changed = false;
        if !state.baseline_established {
            state.baseline_established = true;
            changed = true;
        }
        for hash in hashes {
            if !state.reset_id_hashes.contains(&hash) {
                state.reset_id_hashes.push(hash);
                changed = true;
            }
        }
        if state.reset_id_hashes.len() > MAX_TRACKED_RESET_IDS {
            let overflow = state.reset_id_hashes.len() - MAX_TRACKED_RESET_IDS;
            state.reset_id_hashes.drain(..overflow);
            changed = true;
        }
        if has_new && state.pending_event_ids.len() < MAX_PENDING_RESET_EVENTS {
            state.pending_event_ids.push(Uuid::new_v4().to_string());
            changed = true;
        }
        drop(state);
        if changed {
            self.persist().await;
        }
        has_new
    }

    async fn has_pending(&self) -> bool {
        !self.state.lock().await.pending_event_ids.is_empty()
    }

    async fn pending(&self) -> Vec<String> {
        self.state.lock().await.pending_event_ids.clone()
    }

    async fn complete(&self, event_id: &str) {
        let mut state = self.state.lock().await;
        let before = state.pending_event_ids.len();
        state.pending_event_ids.retain(|value| value != event_id);
        let changed = state.pending_event_ids.len() != before;
        drop(state);
        if changed {
            self.persist().await;
        }
    }

    async fn clear(&self) {
        *self.state.lock().await = ResetPushState::default();
        if let Some(path) = self.state_path.lock().await.as_ref() {
            let _ = tokio::fs::remove_file(path).await;
        }
    }

    async fn persist(&self) {
        let Some(path) = self.state_path.lock().await.clone() else {
            return;
        };
        let Ok(bytes) = serde_json::to_vec(&*self.state.lock().await) else {
            return;
        };
        if let Some(directory) = path.parent()
            && tokio::fs::create_dir_all(directory).await.is_ok()
        {
            let temporary = directory.join(format!(".reset-push-{}.tmp", Uuid::new_v4()));
            if tokio::fs::write(&temporary, bytes).await.is_ok() {
                if tokio::fs::rename(&temporary, &path).await.is_err() {
                    if tokio::fs::remove_file(&path).await.is_ok() {
                        let _ = tokio::fs::rename(&temporary, &path).await;
                    }
                    let _ = tokio::fs::remove_file(temporary).await;
                }
            }
        }
    }
}

fn decode_tracker_salt(value: &str) -> Option<Vec<u8>> {
    URL_SAFE_NO_PAD
        .decode(value)
        .ok()
        .filter(|bytes| bytes.len() == 16)
}

fn hash_reset_id(salt: &[u8], id: &str) -> String {
    let mut input = Vec::with_capacity(salt.len() + id.len() + 32);
    input.extend_from_slice(b"statusline-codex-reset-id-v1\0");
    input.extend_from_slice(salt);
    input.extend_from_slice(id.as_bytes());
    URL_SAFE_NO_PAD.encode(digest::digest(&digest::SHA256, &input).as_ref())
}

#[cfg(test)]
mod reset_push_tests {
    use super::*;
    use crate::usage::{ResetCredit, ResetCreditsSummary};
    use serde_json::json;

    fn read_credits(rows: serde_json::Value, count: i64, reset_at: i64) -> UsageResponse {
        crate::usage::normalize_usage(
            json!({"account": {"type": "chatgpt", "planType": "plus"}}),
            json!({
                "rateLimitsByLimitId": {
                    "codex": {"limitId": "codex", "secondary": {
                        "usedPercent": 25, "windowDurationMins": 10080, "resetsAt": reset_at
                    }}
                },
                "rateLimitResetCredits": {"availableCount": count, "credits": rows}
            }),
            1_900_000_000,
        )
    }

    fn row(id: &str, status: &str) -> serde_json::Value {
        json!({"id": id, "resetType": "codexRateLimits", "status": status,
            "grantedAt": 1_899_000_000, "expiresAt": 1_901_000_000})
    }

    #[tokio::test]
    async fn normalized_existing_credit_is_a_silent_baseline() {
        let tracker = ResetPushTracker::default();
        let first = read_credits(
            json!([row("fixture-existing", "available")]),
            1,
            1_900_000_000,
        );
        assert!(!tracker.observe(&first).await);
        assert!(!tracker.has_pending().await);
        assert!(tracker.state.lock().await.baseline_established);
    }

    #[tokio::test]
    async fn new_id_after_complete_empty_baseline_enqueues_exactly_one_event() {
        let tracker = ResetPushTracker::default();
        assert!(
            !tracker
                .observe(&read_credits(json!([]), 0, 1_900_000_000))
                .await
        );
        let new = read_credits(json!([row("fixture-new", "available")]), 1, 1_900_000_000);
        assert!(tracker.observe(&new).await);
        let events = tracker.pending().await;
        assert_eq!(events.len(), 1);
        assert!(uuid::Uuid::parse_str(&events[0]).is_ok());
        assert!(!events[0].contains("fixture"));
        assert!(!tracker.observe(&new).await);
        assert_eq!(tracker.pending().await, events);
        tracker.complete(&events[0]).await;
        assert!(!tracker.has_pending().await);
    }

    #[tokio::test]
    async fn unchanged_count_with_different_identity_detects_new_reset() {
        let tracker = ResetPushTracker::default();
        let first = read_credits(json!([row("fixture-a", "available")]), 1, 1_900_000_000);
        let next = read_credits(json!([row("fixture-b", "available")]), 1, 1_900_000_000);
        assert!(!tracker.observe(&first).await);
        assert!(tracker.observe(&next).await);
        assert_eq!(tracker.pending().await.len(), 1);
    }

    #[tokio::test]
    async fn disappearance_and_reappearance_of_known_id_do_not_alert() {
        let tracker = ResetPushTracker::default();
        let existing = read_credits(json!([row("fixture-a", "available")]), 1, 1_900_000_000);
        assert!(!tracker.observe(&existing).await);
        assert!(
            !tracker
                .observe(&read_credits(json!([]), 0, 1_900_000_000))
                .await
        );
        assert!(!tracker.observe(&existing).await);
        assert!(!tracker.has_pending().await);
    }

    #[tokio::test]
    async fn reordered_existing_ids_and_weekly_reset_time_do_not_alert() {
        let tracker = ResetPushTracker::default();
        let first = read_credits(
            json!([row("fixture-a", "available"), row("fixture-b", "available")]),
            2,
            1_900_000_000,
        );
        let next = read_credits(
            json!([row("fixture-b", "available"), row("fixture-a", "available")]),
            2,
            1_900_604_800,
        );
        assert!(!tracker.observe(&first).await);
        assert!(!tracker.observe(&next).await);
        assert!(!tracker.has_pending().await);
    }

    #[tokio::test]
    async fn count_only_partial_and_expired_rows_cannot_trigger_false_alert() {
        let tracker = ResetPushTracker::default();
        for usage in [
            read_credits(serde_json::Value::Null, 2, 1_900_000_000),
            read_credits(json!([row("fixture-a", "available")]), 2, 1_900_000_000),
            read_credits(json!([row("fixture-expired", "expired")]), 1, 1_900_000_000),
        ] {
            assert!(!tracker.observe(&usage).await);
            assert!(!tracker.state.lock().await.baseline_established);
        }
        assert!(!tracker.has_pending().await);
    }

    #[tokio::test]
    async fn unavailable_read_does_not_erase_baseline_or_create_alert() {
        let tracker = ResetPushTracker::default();
        let existing = read_credits(json!([row("fixture-a", "available")]), 1, 1_900_000_000);
        assert!(!tracker.observe(&existing).await);
        let unavailable = UsageResponse::Error {
            code: "offline".into(),
            message: "fixture unavailable".into(),
            checked_at: 1_900_000_001,
        };
        assert!(!tracker.observe(&unavailable).await);
        assert!(tracker.state.lock().await.baseline_established);
        assert!(!tracker.observe(&existing).await);
        assert!(!tracker.has_pending().await);
    }

    #[tokio::test]
    async fn persistence_retains_pending_event_without_raw_ids_and_restart_deduplicates() {
        let directory = tempfile::tempdir().unwrap();
        let tracker = ResetPushTracker::default();
        tracker.configure(directory.path()).await;
        assert!(
            !tracker
                .observe(&read_credits(json!([]), 0, 1_900_000_000))
                .await
        );
        let new = read_credits(
            json!([row("fixture-secret-id-not-persisted", "available")]),
            1,
            1_900_000_000,
        );
        assert!(tracker.observe(&new).await);
        let pending = tracker.pending().await;
        let persisted = tokio::fs::read_to_string(directory.path().join(RESET_PUSH_STATE_FILE))
            .await
            .unwrap();
        assert!(!persisted.contains("fixture-secret-id-not-persisted"));
        assert!(!persisted.contains("expiresAt"));
        let restarted = ResetPushTracker::default();
        restarted.configure(directory.path()).await;
        assert_eq!(restarted.pending().await, pending);
        assert!(!restarted.observe(&new).await);
        assert_eq!(restarted.pending().await, pending);
        restarted.complete(&pending[0]).await;
        let completed = ResetPushTracker::default();
        completed.configure(directory.path()).await;
        assert!(!completed.has_pending().await);
        assert!(!completed.observe(&new).await);
    }

    fn summary(ids: &[&str]) -> ResetCreditsSummary {
        ResetCreditsSummary {
            available_count: ids.len() as i64,
            credits: Some(
                ids.iter()
                    .map(|id| ResetCredit {
                        id: (*id).to_owned(),
                        expires_at: Some(1_900_000_000),
                    })
                    .collect(),
            ),
        }
    }

    #[tokio::test]
    async fn first_complete_observation_is_a_baseline_and_new_ids_create_an_opaque_event() {
        let tracker = ResetPushTracker::default();
        let first = UsageResponse::Ready {
            weekly: crate::usage::UsageWindow {
                used_percent: 10.0,
                remaining_percent: 90.0,
                window_duration_mins: 10_080,
                resets_at: 1_900_000_000,
                label: "Codex".into(),
            },
            short_window: None,
            reset_credits: Some(summary(&["existing-reset"])),
            plan: None,
            account_type: "plus".into(),
            checked_at: 1_900_000_000,
            limit_count: 1,
        };
        assert!(!tracker.observe(&first).await);
        assert!(!tracker.has_pending().await);
        let mut next = first.clone();
        if let UsageResponse::Ready { reset_credits, .. } = &mut next {
            *reset_credits = Some(summary(&["existing-reset", "new-reset"]));
        }
        assert!(tracker.observe(&next).await);
        let events = tracker.pending().await;
        assert_eq!(events.len(), 1);
        assert!(!events[0].contains("reset"));
        assert!(!tracker.observe(&next).await);
        assert_eq!(tracker.pending().await, events);
    }

    #[tokio::test]
    async fn partial_detail_does_not_create_a_baseline_or_an_event() {
        let tracker = ResetPushTracker::default();
        let incomplete = UsageResponse::Ready {
            weekly: crate::usage::UsageWindow {
                used_percent: 10.0,
                remaining_percent: 90.0,
                window_duration_mins: 10_080,
                resets_at: 1_900_000_000,
                label: "Codex".into(),
            },
            short_window: None,
            reset_credits: Some(ResetCreditsSummary {
                available_count: 2,
                credits: Some(vec![ResetCredit {
                    id: "one".into(),
                    expires_at: None,
                }]),
            }),
            plan: None,
            account_type: "plus".into(),
            checked_at: 1_900_000_000,
            limit_count: 1,
        };
        assert!(!tracker.observe(&incomplete).await);
        assert!(!tracker.has_pending().await);
    }
}

async fn refresh_claim_state(
    client: &RelayClient,
    configuration: &RelayConfiguration,
    credentials: &mut PublisherCredentials,
) -> Result<ChannelMetadata, RelayError> {
    let metadata = client.metadata(configuration, credentials).await?;
    validate_channel_metadata(&metadata)?;
    credentials.expires_at = metadata.expires_at;
    credentials.pairing_expires_at = metadata.pairing_expires_at;
    credentials.last_services_published_at = metadata.services_last_published_at;
    if metadata.reader_claimed_at.is_some() {
        credentials.pending_pairing_token = None;
    }
    if metadata.last_published_at.is_some() && credentials.last_published_at.is_none() {
        credentials.last_published_at = metadata.last_published_at;
    }
    Ok(metadata)
}

fn status_for_credentials(
    configuration: &RelayConfiguration,
    credentials: &PublisherCredentials,
) -> Result<RelayStatus, RelayError> {
    if credentials.pending_pairing_token.is_some() {
        pairing_status(configuration, credentials)
    } else {
        Ok(RelayStatus::Connected {
            endpoint: configuration.origin.clone(),
            last_published_at: credentials.last_published_at,
            services_published_at: credentials.last_services_published_at,
        })
    }
}

fn pairing_status(
    configuration: &RelayConfiguration,
    credentials: &PublisherCredentials,
) -> Result<RelayStatus, RelayError> {
    Ok(RelayStatus::Pairing {
        endpoint: configuration.origin.clone(),
        pairing_uri: credentials.pairing_uri()?,
        pairing_expires_at: credentials.pairing_expires_at,
        last_published_at: credentials.last_published_at,
        services_published_at: credentials.last_services_published_at,
    })
}

fn ensure_matching_endpoint(
    configuration: &RelayConfiguration,
    credentials: &PublisherCredentials,
) -> Result<(), RelayError> {
    if credentials.protocol_version != PROTOCOL_VERSION
        || credentials.relay_origin != configuration.origin
    {
        return Err(RelayError::EndpointMismatch);
    }
    Ok(())
}

fn configured_relay() -> Result<Option<RelayConfiguration>, RelayError> {
    RelayConfiguration::load().transpose()
}

fn runtime_or_build_value(name: &str, build_value: Option<&'static str>) -> Option<String> {
    env::var(name)
        .ok()
        .or_else(|| build_value.map(str::to_owned))
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn is_loopback_host(host: &str) -> bool {
    matches!(host, "127.0.0.1" | "localhost" | "[::1]" | "::1")
}

fn error_status(
    configuration: Option<&RelayConfiguration>,
    error: &RelayError,
    has_pairing: bool,
) -> RelayStatus {
    RelayStatus::Error {
        endpoint: configuration.map(|value| value.origin.clone()),
        code: error.code().to_owned(),
        message: error.to_string(),
        has_pairing,
    }
}

async fn decode_json_success<T: DeserializeOwned>(
    response: reqwest::Response,
    expected_status: StatusCode,
) -> Result<T, RelayError> {
    let (status, bytes) = read_bounded_response(response).await?;
    if status != expected_status {
        return Err(decode_server_error(&bytes));
    }
    serde_json::from_slice(&bytes).map_err(|_| RelayError::InvalidResponse)
}

async fn ensure_empty_success(
    response: reqwest::Response,
    expected_statuses: &[StatusCode],
) -> Result<(), RelayError> {
    let (status, bytes) = read_bounded_response(response).await?;
    if !expected_statuses.contains(&status) {
        return Err(decode_server_error(&bytes));
    }
    Ok(())
}

async fn read_bounded_response(
    mut response: reqwest::Response,
) -> Result<(StatusCode, Vec<u8>), RelayError> {
    let status = response.status();
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(RelayError::InvalidResponse);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| RelayError::InvalidResponse)?
    {
        let remaining = MAX_RESPONSE_BYTES
            .checked_sub(bytes.len())
            .ok_or(RelayError::InvalidResponse)?;
        if chunk.len() > remaining {
            return Err(RelayError::InvalidResponse);
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok((status, bytes))
}

fn decode_server_error(bytes: &[u8]) -> RelayError {
    serde_json::from_slice::<APIErrorEnvelope>(bytes).map_or(RelayError::InvalidResponse, |body| {
        let code = body.error.code.trim();
        let message = body.error.message.trim();
        if code.is_empty() || message.is_empty() {
            RelayError::InvalidResponse
        } else {
            RelayError::Server {
                code: code.to_owned(),
                message: message.to_owned(),
            }
        }
    })
}

async fn load_credentials() -> Result<Option<PublisherCredentials>, RelayError> {
    task::spawn_blocking(|| {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
            .map_err(|_| RelayError::SecureStorage)?;
        match entry.get_password() {
            Ok(value) if !value.trim().is_empty() => serde_json::from_str(&value)
                .map(Some)
                .map_err(|_| RelayError::SecureStorage),
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(RelayError::SecureStorage),
        }
    })
    .await
    .map_err(|_| RelayError::SecureStorage)?
}

async fn save_credentials(credentials: PublisherCredentials) -> Result<(), RelayError> {
    task::spawn_blocking(move || {
        let encoded = serde_json::to_string(&credentials).map_err(|_| RelayError::SecureStorage)?;
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
            .map_err(|_| RelayError::SecureStorage)?;
        entry
            .set_password(&encoded)
            .map_err(|_| RelayError::SecureStorage)
    })
    .await
    .map_err(|_| RelayError::SecureStorage)?
}

async fn delete_credentials() -> Result<(), RelayError> {
    task::spawn_blocking(|| {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
            .map_err(|_| RelayError::SecureStorage)?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(RelayError::SecureStorage),
        }
    })
    .await
    .map_err(|_| RelayError::SecureStorage)?
}

#[cfg(test)]
mod tests {
    use super::RelayConfiguration;

    #[test]
    fn production_configuration_requires_https() {
        assert!(RelayConfiguration::parse("https://relay.statusline.example").is_ok());
        assert!(RelayConfiguration::parse("http://relay.statusline.example").is_err());
        assert!(RelayConfiguration::parse("https://user@relay.statusline.example").is_err());
        assert!(RelayConfiguration::parse("https://relay.statusline.example?token=x").is_err());
    }

    #[test]
    fn configuration_normalizes_to_an_origin() {
        let configuration = RelayConfiguration::parse("https://relay.statusline.example/path")
            .expect("valid relay origin");

        assert_eq!(configuration.origin, "https://relay.statusline.example");
        assert_eq!(
            configuration.endpoint("v1/channels").unwrap().as_str(),
            "https://relay.statusline.example/v1/channels"
        );
    }
}
