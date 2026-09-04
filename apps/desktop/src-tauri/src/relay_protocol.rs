use std::time::{SystemTime, UNIX_EPOCH};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use ring::{
    aead::{self, Aad, LessSafeKey, Nonce, UnboundKey},
    rand::{SecureRandom, SystemRandom},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::usage::UsageResponse;

pub const PROTOCOL_VERSION: u8 = 1;
const KEY_BYTES: usize = 32;
const NONCE_BYTES: usize = 12;
const TAG_BYTES: usize = 16;
const PAIRING_SCHEME: &str = "statusline";
const PAIRING_HOST: &str = "pair";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSnapshot {
    pub schema_version: u8,
    pub remaining_percentage: i64,
    pub reset_at: i64,
    pub updated_at: i64,
}

impl UsageSnapshot {
    #[must_use]
    pub fn from_usage(usage: &UsageResponse) -> Option<Self> {
        let UsageResponse::Ready {
            weekly, checked_at, ..
        } = usage
        else {
            return None;
        };
        Some(Self {
            schema_version: PROTOCOL_VERSION,
            remaining_percentage: weekly.remaining_percent.round().clamp(0.0, 100.0) as i64,
            reset_at: weekly.resets_at,
            updated_at: *checked_at,
        })
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotEnvelope {
    pub protocol_version: u8,
    pub sequence: u64,
    pub nonce: String,
    pub ciphertext: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublisherCredentials {
    pub protocol_version: u8,
    pub relay_origin: String,
    pub channel_id: String,
    pub publisher_token: String,
    pub encryption_key: String,
    #[serde(alias = "pendingReaderToken")]
    pub pending_pairing_token: Option<String>,
    pub pairing_expires_at: i64,
    pub expires_at: i64,
    pub last_sequence: Option<u64>,
    pub last_published_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChannelResponse {
    pub protocol_version: u8,
    pub channel_id: String,
    pub publisher_token: String,
    #[serde(alias = "readerToken")]
    pub pairing_token: String,
    pub pairing_expires_at: i64,
    pub expires_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMetadata {
    pub protocol_version: u8,
    pub reader_claimed_at: Option<i64>,
    pub pairing_expires_at: i64,
    pub last_published_at: Option<i64>,
    pub expires_at: i64,
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum ProtocolError {
    #[error("The relay returned invalid channel credentials.")]
    InvalidCredentials,
    #[error("The operating system could not generate secure random data.")]
    SecureRandom,
    #[error("The quota snapshot could not be encrypted.")]
    Encryption,
    #[error("The pairing link is invalid.")]
    InvalidPairing,
    #[error("The system clock is unavailable.")]
    InvalidClock,
}

impl PublisherCredentials {
    pub fn from_created(
        relay_origin: String,
        response: CreateChannelResponse,
    ) -> Result<Self, ProtocolError> {
        validate_created_response(&response)?;
        let encryption_key = generate_secret(KEY_BYTES)?;
        Ok(Self {
            protocol_version: PROTOCOL_VERSION,
            relay_origin,
            channel_id: response.channel_id,
            publisher_token: response.publisher_token,
            encryption_key,
            pending_pairing_token: Some(response.pairing_token),
            pairing_expires_at: response.pairing_expires_at,
            expires_at: response.expires_at,
            last_sequence: None,
            last_published_at: None,
        })
    }

    pub fn pairing_uri(&self) -> Result<String, ProtocolError> {
        let pairing_token = self
            .pending_pairing_token
            .as_deref()
            .ok_or(ProtocolError::InvalidPairing)?;
        pairing_uri(&self.channel_id, pairing_token, &self.encryption_key)
    }

    pub fn next_sequence(&self) -> Result<u64, ProtocolError> {
        let milliseconds = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| ProtocolError::InvalidClock)?
            .as_millis();
        let timestamp = u64::try_from(milliseconds).map_err(|_| ProtocolError::InvalidClock)?;
        Ok(self.last_sequence.map_or(timestamp, |previous| {
            timestamp.max(previous.saturating_add(1))
        }))
    }
}

pub fn encrypt_snapshot(
    snapshot: &UsageSnapshot,
    credentials: &PublisherCredentials,
    sequence: u64,
) -> Result<SnapshotEnvelope, ProtocolError> {
    let key = decode_exact(&credentials.encryption_key, KEY_BYTES)?;
    let nonce = random_bytes(NONCE_BYTES)?;
    encrypt_snapshot_with_nonce(snapshot, &credentials.channel_id, sequence, &key, &nonce)
}

fn encrypt_snapshot_with_nonce(
    snapshot: &UsageSnapshot,
    channel_id: &str,
    sequence: u64,
    key_bytes: &[u8],
    nonce_bytes: &[u8],
) -> Result<SnapshotEnvelope, ProtocolError> {
    if key_bytes.len() != KEY_BYTES || nonce_bytes.len() != NONCE_BYTES {
        return Err(ProtocolError::InvalidCredentials);
    }
    let unbound = UnboundKey::new(&aead::AES_256_GCM, key_bytes)
        .map_err(|_| ProtocolError::InvalidCredentials)?;
    let key = LessSafeKey::new(unbound);
    let nonce_array: [u8; NONCE_BYTES] = nonce_bytes
        .try_into()
        .map_err(|_| ProtocolError::InvalidCredentials)?;
    let nonce = Nonce::assume_unique_for_key(nonce_array);
    let mut plaintext = serde_json::to_vec(snapshot).map_err(|_| ProtocolError::Encryption)?;
    key.seal_in_place_append_tag(nonce, Aad::from(aad(channel_id)), &mut plaintext)
        .map_err(|_| ProtocolError::Encryption)?;
    if plaintext.len() <= TAG_BYTES {
        return Err(ProtocolError::Encryption);
    }
    Ok(SnapshotEnvelope {
        protocol_version: PROTOCOL_VERSION,
        sequence,
        nonce: URL_SAFE_NO_PAD.encode(nonce_bytes),
        ciphertext: URL_SAFE_NO_PAD.encode(plaintext),
    })
}

pub fn validate_channel_metadata(metadata: &ChannelMetadata) -> Result<(), ProtocolError> {
    if metadata.protocol_version != PROTOCOL_VERSION
        || metadata.pairing_expires_at <= 0
        || metadata.expires_at <= 0
        || metadata.reader_claimed_at.is_some_and(|value| value <= 0)
        || metadata.last_published_at.is_some_and(|value| value <= 0)
    {
        return Err(ProtocolError::InvalidCredentials);
    }
    Ok(())
}

fn validate_created_response(response: &CreateChannelResponse) -> Result<(), ProtocolError> {
    if response.protocol_version != PROTOCOL_VERSION
        || Uuid::parse_str(&response.channel_id).is_err()
        || response.pairing_expires_at <= 0
        || response.expires_at <= response.pairing_expires_at
    {
        return Err(ProtocolError::InvalidCredentials);
    }
    decode_exact(&response.publisher_token, KEY_BYTES)?;
    decode_exact(&response.pairing_token, KEY_BYTES)?;
    Ok(())
}

fn pairing_uri(
    channel_id: &str,
    pairing_token: &str,
    encryption_key: &str,
) -> Result<String, ProtocolError> {
    if Uuid::parse_str(channel_id).is_err() {
        return Err(ProtocolError::InvalidPairing);
    }
    decode_exact(pairing_token, KEY_BYTES).map_err(|_| ProtocolError::InvalidPairing)?;
    decode_exact(encryption_key, KEY_BYTES).map_err(|_| ProtocolError::InvalidPairing)?;
    let mut url = reqwest::Url::parse(&format!("{PAIRING_SCHEME}://{PAIRING_HOST}"))
        .map_err(|_| ProtocolError::InvalidPairing)?;
    url.query_pairs_mut()
        .append_pair("v", "1")
        .append_pair("channel", channel_id)
        .append_pair("pairing", pairing_token)
        .append_pair("key", encryption_key);
    Ok(url.into())
}

#[must_use]
pub fn aad(channel_id: &str) -> Vec<u8> {
    format!("statusline.snapshot.v1|{channel_id}").into_bytes()
}

fn generate_secret(length: usize) -> Result<String, ProtocolError> {
    Ok(URL_SAFE_NO_PAD.encode(random_bytes(length)?))
}

fn random_bytes(length: usize) -> Result<Vec<u8>, ProtocolError> {
    let mut bytes = vec![0_u8; length];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| ProtocolError::SecureRandom)?;
    Ok(bytes)
}

fn decode_exact(value: &str, expected_length: usize) -> Result<Vec<u8>, ProtocolError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(value)
        .map_err(|_| ProtocolError::InvalidCredentials)?;
    if bytes.len() != expected_length {
        return Err(ProtocolError::InvalidCredentials);
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
    use ring::aead::{self, Aad, LessSafeKey, Nonce, UnboundKey};

    use super::{
        PROTOCOL_VERSION, PublisherCredentials, UsageSnapshot, aad, encrypt_snapshot_with_nonce,
    };

    const CHANNEL: &str = "018f47a0-7b52-4c15-9e55-5f0f266b7440";

    #[test]
    fn pairing_uri_contains_only_short_lived_reader_material() {
        let credentials = PublisherCredentials {
            protocol_version: PROTOCOL_VERSION,
            relay_origin: "https://relay.example".to_owned(),
            channel_id: CHANNEL.to_owned(),
            publisher_token: URL_SAFE_NO_PAD.encode([9_u8; 32]),
            encryption_key: URL_SAFE_NO_PAD.encode([7_u8; 32]),
            pending_pairing_token: Some(URL_SAFE_NO_PAD.encode([8_u8; 32])),
            pairing_expires_at: 1_900_000_600,
            expires_at: 1_902_592_000,
            last_sequence: None,
            last_published_at: None,
        };

        let uri = credentials.pairing_uri().expect("valid pairing URI");

        assert!(uri.starts_with("statusline://pair?v=1&channel="));
        assert!(uri.contains("pairing="));
        assert!(uri.contains("key="));
        assert!(!uri.contains(&credentials.publisher_token));
        assert!(!uri.contains(&credentials.relay_origin));
    }

    #[test]
    fn encrypted_snapshot_round_trips_with_aes_256_gcm() {
        let snapshot = UsageSnapshot {
            schema_version: 1,
            remaining_percentage: 53,
            reset_at: 2_000_500_000,
            updated_at: 1_900_000_000,
        };
        let key_bytes = [7_u8; 32];
        let nonce_bytes = [3_u8; 12];
        let envelope =
            encrypt_snapshot_with_nonce(&snapshot, CHANNEL, 42, &key_bytes, &nonce_bytes)
                .expect("encryption succeeds");

        assert_eq!(envelope.nonce, "AwMDAwMDAwMDAwMD");
        assert_eq!(
            envelope.ciphertext,
            "XtzQYDJNMyMsJTEvgjiRLtcNzM3G8PkRRrDu34S1JcrSwhNW-pzAYvS9eCmvvII2QlBSsKu4D0ccGBuTDhy4WNvBTgjLxwB0LafDpe6m_QPNmvlFOlN-ULB4xKEyQdYIufoRJhKAKfU"
        );

        let unbound = UnboundKey::new(&aead::AES_256_GCM, &key_bytes).unwrap();
        let key = LessSafeKey::new(unbound);
        let nonce = Nonce::assume_unique_for_key(nonce_bytes);
        let mut ciphertext = URL_SAFE_NO_PAD.decode(envelope.ciphertext).unwrap();
        let plaintext = key
            .open_in_place(nonce, Aad::from(aad(CHANNEL)), &mut ciphertext)
            .expect("authenticated decryption succeeds");
        let decoded: UsageSnapshot = serde_json::from_slice(plaintext).unwrap();

        assert_eq!(decoded, snapshot);
    }
}
