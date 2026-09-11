//! Pure, offline-testable policy for the public GitHub release feed.
//! Neither account credentials nor caller-supplied URLs enter this protocol.
use serde::Deserialize;
use std::time::Duration;

pub const CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);

pub fn next_check_delay(automatic: bool, elapsed: Option<Duration>) -> Option<Duration> {
    automatic.then(|| {
        elapsed.map_or(Duration::ZERO, |elapsed| {
            CHECK_INTERVAL.saturating_sub(elapsed)
        })
    })
}

pub const RELEASES_URL: &str =
    "https://api.github.com/repos/arvivares/statusline/releases?per_page=20";
pub const MAX_FEED_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_MANIFEST_BYTES: u64 = 64 * 1024;
pub const MAX_DOWNLOAD_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize)]
pub struct Asset {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
}

#[derive(Debug, Deserialize)]
pub struct Release {
    pub tag_name: String,
    pub draft: bool,
    pub prerelease: bool,
    pub assets: Vec<Asset>,
}

#[derive(Clone, Debug)]
pub struct Candidate {
    pub version: String,
    pub assets: Vec<Asset>,
}

/// Only product release tags, never arbitrary refs, channels or URL fragments.
pub fn version_parts(value: &str) -> Option<[u64; 3]> {
    let parts: Vec<_> = value.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let mut numbers = [0; 3];
    for (index, part) in parts.iter().enumerate() {
        if part.is_empty()
            || (part.len() > 1 && part.starts_with('0'))
            || !part.bytes().all(|byte| byte.is_ascii_digit())
        {
            return None;
        }
        numbers[index] = part.parse().ok()?;
    }
    Some(numbers)
}

pub fn release_url(version: &str) -> Option<String> {
    version_parts(version)?;
    Some(format!(
        "https://github.com/arvivares/statusline/releases/tag/v{version}"
    ))
}

pub fn asset_url(version: &str, name: &str) -> Option<String> {
    version_parts(version)?;
    if name.is_empty()
        || name.starts_with('.')
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
    {
        return None;
    }
    Some(format!(
        "https://github.com/arvivares/statusline/releases/download/v{version}/{name}"
    ))
}

pub fn select_release(body: &[u8], current: &str, beta: bool) -> Result<Option<Candidate>, ()> {
    if body.len() > MAX_FEED_BYTES {
        return Err(());
    }
    let current = version_parts(current).ok_or(())?;
    let releases: Vec<Release> = serde_json::from_slice(body).map_err(|_| ())?;
    let mut selected: Option<([u64; 3], Candidate)> = None;
    for release in releases {
        if release.draft || (!beta && release.prerelease) {
            continue;
        }
        let Some(version) = release.tag_name.strip_prefix('v') else {
            continue;
        };
        let Some(parts) = version_parts(version) else {
            continue;
        };
        if parts <= current || selected.as_ref().is_some_and(|(found, _)| parts <= *found) {
            continue;
        }
        let manifests: Vec<_> = release
            .assets
            .iter()
            .filter(|asset| asset.name == "updater.json")
            .collect();
        if manifests.len() != 1 {
            continue;
        }
        let manifest = manifests[0];
        if manifest.size == 0
            || manifest.size > MAX_MANIFEST_BYTES
            || Some(&manifest.browser_download_url) != asset_url(version, "updater.json").as_ref()
        {
            continue;
        }
        selected = Some((
            parts,
            Candidate {
                version: version.to_owned(),
                assets: release.assets,
            },
        ));
    }
    Ok(selected.map(|(_, candidate)| candidate))
}

/// Pin the payload to an asset in this release and to the installed format.
pub fn valid_download(candidate: &Candidate, url: &str, target: &str) -> bool {
    let suffix = match target {
        "windows-x86_64-nsis" => ".exe",
        "windows-x86_64-msi" => ".msi",
        "linux-x86_64-appimage" => ".AppImage",
        "darwin-aarch64" | "darwin-x86_64" => ".app.tar.gz",
        _ => return false,
    };
    let assets: Vec<_> = candidate
        .assets
        .iter()
        .filter(|asset| asset.browser_download_url == url)
        .collect();
    assets.len() == 1
        && assets[0].size > 0
        && assets[0].size <= MAX_DOWNLOAD_BYTES
        && assets[0].name.ends_with(suffix)
        && Some(url) == asset_url(&candidate.version, &assets[0].name).as_deref()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    #[test]
    fn manual_check_reschedules_without_skipping_an_extra_six_hours() {
        assert_eq!(
            next_check_delay(true, Some(CHECK_INTERVAL - Duration::from_secs(60))),
            Some(Duration::from_secs(60))
        );
        assert_eq!(next_check_delay(false, None), None);
        assert_eq!(next_check_delay(true, None), Some(Duration::ZERO));
        assert_eq!(
            next_check_delay(true, Some(CHECK_INTERVAL + Duration::from_secs(60))),
            Some(Duration::ZERO)
        );
    }

    fn release(version: &str) -> Value {
        json!({"tag_name": format!("v{version}"), "draft": false, "prerelease": true,
          "assets": [{"name": "updater.json", "size": 2000,
            "browser_download_url": asset_url(version, "updater.json").unwrap()}]})
    }
    fn select(values: Vec<Value>, beta: bool) -> Option<Candidate> {
        select_release(&serde_json::to_vec(&values).unwrap(), "0.1.17", beta).unwrap()
    }
    #[test]
    fn beta_feed_uses_highest_version_not_first_or_latest_endpoint() {
        let found = select(
            vec![release("0.1.18"), release("0.1.20"), release("0.1.19")],
            true,
        )
        .unwrap();
        assert_eq!(found.version, "0.1.20");
        assert!(select(vec![release("0.1.18")], false).is_none());
    }
    #[test]
    fn ignores_drafts_old_releases_and_missing_manifests() {
        let mut draft = release("0.1.18");
        draft["draft"] = json!(true);
        let mut incomplete = release("0.1.19");
        incomplete["assets"] = json!([]);
        assert!(
            select(
                vec![draft, incomplete, release("0.1.17"), release("0.1.16")],
                true
            )
            .is_none()
        );
    }
    #[test]
    fn rejects_foreign_oversized_and_duplicate_manifests() {
        for change in [
            json!("https://evil.example/updater.json"),
            json!("http://github.com/arvivares/statusline/releases/download/v0.1.18/updater.json"),
        ] {
            let mut invalid = release("0.1.18");
            invalid["assets"][0]["browser_download_url"] = change;
            assert!(select(vec![invalid], true).is_none());
        }
        let mut big = release("0.1.18");
        big["assets"][0]["size"] = json!(MAX_MANIFEST_BYTES + 1);
        assert!(select(vec![big], true).is_none());
        let mut duplicate = release("0.1.18");
        duplicate["assets"]
            .as_array_mut()
            .unwrap()
            .push(release("0.1.18")["assets"][0].clone());
        assert!(select(vec![duplicate], true).is_none());
    }
    #[test]
    fn strict_versions_and_paths_cannot_escape_repo() {
        for version in [
            "1.0",
            "01.0.0",
            "1.2.3-beta",
            "1.2.3/../main",
            "1.2.3?x",
            "-1.2.3",
            "1.2.18446744073709551616",
        ] {
            assert!(version_parts(version).is_none());
            assert!(release_url(version).is_none());
        }
        for name in [
            "../bad.exe",
            "/bad.exe",
            "foo?bar.exe",
            "foo%2F.exe",
            "foo.exe#x",
            "",
        ] {
            assert!(asset_url("0.1.18", name).is_none());
        }
    }
    #[test]
    fn payload_must_match_published_asset_and_installed_format() {
        let url = asset_url("0.1.18", "Statusline_0.1.18.unsigned.exe").unwrap();
        let mut candidate = select(vec![release("0.1.18")], true).unwrap();
        candidate.assets.push(Asset {
            name: "Statusline_0.1.18.unsigned.exe".into(),
            browser_download_url: url.clone(),
            size: 42,
        });
        assert!(valid_download(&candidate, &url, "windows-x86_64-nsis"));
        assert!(!valid_download(&candidate, &url, "windows-x86_64-msi"));
        assert!(!valid_download(
            &candidate,
            &url.replace("v0.1.18", "v0.1.19"),
            "windows-x86_64-nsis"
        ));
        candidate.assets[1].size = MAX_DOWNLOAD_BYTES + 1;
        assert!(!valid_download(&candidate, &url, "windows-x86_64-nsis"));
    }
    #[test]
    fn malformed_or_unbounded_feed_is_an_error_not_up_to_date() {
        assert!(select_release(b"{}", "0.1.17", true).is_err());
        assert!(select_release(&vec![b' '; MAX_FEED_BYTES + 1], "0.1.17", true).is_err());
    }
}
