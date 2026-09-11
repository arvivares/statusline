use base64::{Engine, engine::general_purpose::STANDARD};
use minisign_verify::{PublicKey, Signature};
use std::{
    env,
    error::Error,
    fs::File,
    io::{self, Read},
};

fn decode(value: Option<&str>) -> Result<String, Box<dyn Error>> {
    let value = value.ok_or("missing base64 envelope")?;
    if value.is_empty() || value.len() > 16384 {
        return Err("invalid envelope length".into());
    }
    Ok(String::from_utf8(STANDARD.decode(value)?)?)
}

fn run() -> Result<(), Box<dyn Error>> {
    let args: Vec<_> = env::args_os().skip(1).collect();
    let mut input = String::new();
    io::stdin().take(32771).read_to_string(&mut input)?;
    if input.len() > 32770 {
        return Err("oversized verifier input".into());
    }
    let mut lines = input.lines();
    let public_key = PublicKey::decode(&decode(lines.next())?)?;
    if args.len() == 1 && args[0] == "public-key" {
        if lines.next().is_some() {
            return Err("unexpected verifier input".into());
        }
        return Ok(());
    }
    if args.len() != 2 || args[0] != "verify" {
        return Err("expected public-key or verify <payload-path>".into());
    }
    let signature = Signature::decode(&decode(lines.next())?)?;
    if lines.next().is_some() {
        return Err("unexpected verifier input".into());
    }
    // The library checks the key ID, prehashed payload AND trusted comment.
    // Streaming also rejects legacy signatures and avoids loading installers.
    let mut verifier = public_key.verify_stream(&signature)?;
    let mut payload = File::open(&args[1])?;
    if !payload.metadata()?.is_file() {
        return Err("payload is not a regular file".into());
    }
    let mut buffer = [0_u8; 65536];
    loop {
        let count = payload.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        verifier.update(&buffer[..count]);
    }
    verifier.finalize()?;
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("Updater validation failed: {error}");
        std::process::exit(1);
    }
}
