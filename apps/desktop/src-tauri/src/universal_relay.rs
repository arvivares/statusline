use std::{env, time::Duration};

use reqwest::{Client, StatusCode, Url, redirect::Policy};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use tokio::{
    sync::{Mutex, Notify},
    task,
};

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
}

impl UniversalRelayState {
    pub async fn record_claude(&self, view: &crate::claude::View) {
        if self.inventory.lock().await.record_claude(view) {
            self.publication_requested.notify_one();
        }
    }

    pub async fn record_codex(&self, usage: &UsageResponse) {
        if self.inventory.lock().await.record_codex(usage) {
            self.publication_requested.notify_one();
        }
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
        if let Some((channel, previous)) = self.last_publication.lock().await.as_ref()
            && *channel == credentials.channel_id
            && *previous == snapshot
        {
            return status_for_credentials(configuration, &credentials);
        }
        // Uses the existing authenticated metadata request, not a health poll.
        let metadata = refresh_claim_state(&self.client, configuration, &mut credentials).await?;
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
        } else {
            save_credentials(credentials.clone()).await?;
            return status_for_credentials(configuration, &credentials);
        }
        credentials.last_sequence = Some(sequence);
        credentials.last_published_at = Some(snapshot.updated_at);
        let status = status_for_credentials(configuration, &credentials)?;
        save_credentials(credentials.clone()).await?;
        *self.last_publication.lock().await = Some((credentials.channel_id, snapshot));
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
