//! Same minisign verifier and prehashed-signature policy as Tauri's updater.
use base64::{Engine, engine::general_purpose::STANDARD};
use minisign_verify::{PublicKey, Signature};

pub fn verify(bytes: &[u8], signature: &str, public_key: &str) -> Result<(), ()> {
    if signature.len() > 2048 || public_key.len() > 2048 {
        return Err(());
    }
    let key = String::from_utf8(STANDARD.decode(public_key).map_err(|_| ())?).map_err(|_| ())?;
    let signature =
        String::from_utf8(STANDARD.decode(signature).map_err(|_| ())?).map_err(|_| ())?;
    PublicKey::decode(&key)
        .map_err(|_| ())?
        .verify(bytes, &Signature::decode(&signature).map_err(|_| ())?, true)
        .map_err(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    // Public verification vector from minisign-verify's MIT-licensed README.
    // No private signing material is stored in this fixture.
    fn vector() -> (String, String) {
        (STANDARD.encode("untrusted comment: test public key\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3\n"),
         STANDARD.encode("untrusted comment: signature from minisign secret key\nRWQf6LRCGA9i59SLOFxz6NxvASXDJeRtuZykwQepbDEGt87ig1BNpWaVWuNrm73YiIiJbq71Wi+dP9eKL8OC351vwIasSSbXxwA=\ntrusted comment: timestamp:1555779966\tfile:test\nQtKMXWyYcwdpZAlPF7tE2ENJkRd1ujvKjlj1m9RtHTBnZPa5WKU5uWRs5GoP5M/VqE81QFuMKI5k/SfNQUaOAA=="))
    }
    #[test]
    fn verifies_a_public_vector_and_rejects_tampered_payload() {
        let (key, sig) = vector();
        assert!(verify(b"test", &sig, &key).is_ok());
        assert!(verify(b"tamp", &sig, &key).is_err());
    }
    #[test]
    fn rejects_missing_malformed_or_oversized_signatures() {
        let (key, sig) = vector();
        assert!(verify(b"test", "", &key).is_err());
        assert!(verify(b"test", &sig, "invalid").is_err());
        assert!(verify(b"test", &"A".repeat(2049), &key).is_err());
        let tampered = String::from_utf8(STANDARD.decode(sig).unwrap())
            .unwrap()
            .replace("file:test", "file:evil");
        assert!(verify(b"test", &STANDARD.encode(tampered), &key).is_err());
    }
}
