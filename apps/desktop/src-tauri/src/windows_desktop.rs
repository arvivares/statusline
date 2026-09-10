//! Windows desktop runtime discovery. Package metadata comes from the current
//! user's registration, never a recursive scan of protected WindowsApps folders.
use std::{
    fs,
    path::{Path, PathBuf},
};

use super::push_unique_path;

const MAX_PACKAGES: usize = 16;
const MAX_METADATA_BYTES: usize = 64 * 1024;
const MAX_APP_VERSIONS: usize = 16;
const PACKAGE_QUERY: &str = include_str!("../../scripts/discover-codex-desktop-windows.ps1");

#[derive(serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct DesktopPackage {
    name: String,
    install_location: String,
}

// Package names are discovery hints, not a substitute for OS publisher trust.
// Never execute the graphical ChatGPT.exe/Codex.exe or an app-execution alias.
fn registered_roots(metadata: &[u8]) -> Vec<PathBuf> {
    if metadata.len() > MAX_METADATA_BYTES {
        return Vec::new();
    }
    let Ok(packages) = serde_json::from_slice::<Vec<DesktopPackage>>(metadata) else {
        return Vec::new();
    };
    let mut roots = Vec::new();
    for package in packages.into_iter().take(MAX_PACKAGES) {
        if !["OpenAI.ChatGPT-Desktop", "OpenAI.ChatGPT", "OpenAI.Codex"]
            .iter()
            .any(|name| package.name.eq_ignore_ascii_case(name))
            || !is_local_windows_absolute_path(&package.install_location)
        {
            continue;
        }
        push_unique_path(&mut roots, PathBuf::from(package.install_location));
    }
    roots
}

fn is_local_windows_absolute_path(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() > 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'\\' | b'/')
        && !value.chars().any(|c| c.is_control())
        && !value[3..].contains(':')
        && !value
            .split(['\\', '/'])
            .any(|part| part == ".." || part == ".")
}

fn classic_roots(local_app_data: &[PathBuf], program_files: &[PathBuf]) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for base in local_app_data
        .iter()
        .map(|root| root.join("Programs"))
        .chain(program_files.iter().cloned())
    {
        for name in ["ChatGPT", "Codex"] {
            push_unique_path(&mut roots, base.join("OpenAI").join(name));
            push_unique_path(&mut roots, base.join(name));
        }
    }
    roots
}

// Electron packages use resources/ in an unpackaged install, and can place the
// application under app/ in MSIX. Check only named runtime files. Package layouts
// are not a public OpenAI contract; clean-device QA remains a release gate.
fn runtime_paths(root: &Path) -> Vec<PathBuf> {
    [root.to_path_buf(), root.join("app")]
        .into_iter()
        .map(|base| base.join("resources").join("codex.exe"))
        .collect()
}

fn versioned_roots(root: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut versions: Vec<_> = entries
        .flatten()
        .take(64)
        .filter_map(|entry| {
            let name = entry.file_name();
            let name = name.to_str()?;
            let version = name.strip_prefix("app-")?;
            let numbers = version
                .split('.')
                .map(str::parse::<u64>)
                .collect::<Result<Vec<_>, _>>()
                .ok()?;
            if !(2..=4).contains(&numbers.len()) || !entry.file_type().ok()?.is_dir() {
                return None;
            }
            Some((numbers, entry.path()))
        })
        .collect();
    versions.sort_by(|left, right| right.0.cmp(&left.0));
    versions
        .into_iter()
        .take(MAX_APP_VERSIONS)
        .map(|(_, path)| path)
        .collect()
}

fn candidates_from_roots(registered: &[PathBuf], classic: &[PathBuf]) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    for root in registered {
        for path in runtime_paths(root) {
            push_unique_path(&mut candidates, path);
        }
    }
    for root in classic {
        for path in runtime_paths(root).into_iter().chain(
            versioned_roots(root)
                .iter()
                .flat_map(|version| runtime_paths(version)),
        ) {
            push_unique_path(&mut candidates, path);
        }
    }
    candidates
}

#[cfg(windows)]
pub(super) async fn discover(
    local_app_data: &[PathBuf],
    program_files: &[PathBuf],
) -> Vec<PathBuf> {
    use std::{env, process::Stdio, time::Duration};
    use tokio::{process::Command, time::timeout};

    let mut registered = Vec::new();
    // Use the OS shell by absolute path, not an inherited npm/installer PATH.
    if let Some(system_root) = env::var_os("SystemRoot")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
    {
        let mut command =
            Command::new(system_root.join("System32/WindowsPowerShell/v1.0/powershell.exe"));
        command
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                PACKAGE_QUERY,
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        super::configure_hidden_process(&mut command);
        if let Ok(Ok(output)) = timeout(Duration::from_secs(8), command.output()).await
            && output.status.success()
        {
            registered = registered_roots(&output.stdout);
        }
    }
    // Unavailable/blocked PowerShell or package discovery never prevents the
    // existing standalone/npm/PATH fallback from being considered.
    candidates_from_roots(&registered, &classic_roots(local_app_data, program_files))
}

#[cfg(test)]
mod tests {
    use std::slice::from_ref;

    use super::*;

    #[test]
    fn msix_metadata_accepts_only_named_packages_and_local_absolute_locations() {
        let data = serde_json::json!([
            {"Name":"OpenAI.Codex", "InstallLocation":"D:\\WindowsApps\\OpenAI.Codex_26.9_x64__test"},
            {"Name":"OpenAI.ChatGPT-Desktop", "InstallLocation":"C:\\Users\\Ada Lovelace\\App\\ChatGPT"},
            {"Name":"Other.Codex", "InstallLocation":"C:\\Other"},
            {"Name":"OpenAI.Codex", "InstallLocation":"C:\\Apps\\..\\Other"},
            {"Name":"OpenAI.Codex", "InstallLocation":"\\\\server\\share"},
            {"Name":"OpenAI.Codex", "InstallLocation":"C:relative"},
            {"Name":"OpenAI.Codex", "InstallLocation":""},
            {"Name":"OpenAI.Codex", "InstallLocation":"C:\\Bad\nPath"}
        ]);
        let roots = registered_roots(&serde_json::to_vec(&data).unwrap());
        assert_eq!(roots.len(), 2);
        assert_eq!(
            roots[0],
            PathBuf::from(r"D:\WindowsApps\OpenAI.Codex_26.9_x64__test")
        );
        assert_eq!(
            roots[1],
            PathBuf::from(r"C:\Users\Ada Lovelace\App\ChatGPT")
        );
    }

    #[test]
    fn missing_malformed_or_excessive_metadata_is_safe() {
        for input in [b"".as_slice(), b"null", b"{}", b"not JSON", b"[]"] {
            assert!(registered_roots(input).is_empty());
        }
        assert!(registered_roots(&vec![b' '; MAX_METADATA_BYTES + 1]).is_empty());
        let rows: Vec<_> = (0..30)
            .map(|index| {
                serde_json::json!({
                    "Name":"OpenAI.Codex", "InstallLocation":format!("C:/Apps/Codex{index}")
                })
            })
            .collect();
        assert_eq!(
            registered_roots(&serde_json::to_vec(&rows).unwrap()).len(),
            MAX_PACKAGES
        );
    }

    #[test]
    fn classic_locations_use_supplied_roots_and_do_not_include_gui_launchers() {
        let local = PathBuf::from("C:/Users/Ada Lovelace/AppData/Local");
        let system = PathBuf::from("D:/Program Files");
        let roots = classic_roots(from_ref(&local), from_ref(&system));
        assert_eq!(roots.len(), 8);
        assert!(roots.contains(&local.join("Programs/OpenAI/ChatGPT")));
        assert!(roots.contains(&system.join("Codex")));
        let paths = candidates_from_roots(&[], &roots);
        assert!(paths.contains(&local.join("Programs/OpenAI/ChatGPT/resources/codex.exe")));
        assert!(
            paths
                .iter()
                .all(|path| path.ends_with("resources/codex.exe"))
        );
    }

    #[test]
    fn registered_package_paths_precede_classic_and_are_not_pinned() {
        let classic = PathBuf::from("C:/Programs/Codex");
        let old = PathBuf::from("D:/WindowsApps/OpenAI.Codex_1.0");
        let new = PathBuf::from("D:/WindowsApps/OpenAI.Codex_2.0");
        let old_paths = candidates_from_roots(from_ref(&old), from_ref(&classic));
        let new_paths = candidates_from_roots(from_ref(&new), from_ref(&classic));
        assert_eq!(old_paths[0], old.join("resources/codex.exe"));
        assert_eq!(new_paths[1], new.join("app/resources/codex.exe"));
        assert!(!new_paths.iter().any(|path| path.starts_with(&old)));
        assert_eq!(candidates_from_roots(&[new.clone(), new], &[]).len(), 2);
    }

    #[test]
    fn versioned_classic_apps_are_bounded_and_sorted_numerically() {
        let root = super::super::tests::test_directory("windows-desktop-versions");
        for name in [
            "app-2.9.0",
            "app-2.10.0",
            "app-cache",
            "other",
            "app-NaN",
            "app-1",
        ] {
            fs::create_dir(root.join(name)).unwrap();
        }
        let versions = versioned_roots(&root);
        assert_eq!(
            versions,
            vec![root.join("app-2.10.0"), root.join("app-2.9.0")]
        );
        let candidates = candidates_from_roots(&[], from_ref(&root));
        assert!(candidates.contains(&root.join("app-2.10.0/resources/codex.exe")));
        assert!(
            !candidates
                .iter()
                .any(|path| path.starts_with(root.join("other")))
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn package_query_is_read_only_current_user_metadata() {
        assert!(PACKAGE_QUERY.contains("Get-AppxPackage -Name 'OpenAI.*' -PackageTypeFilter Main"));
        assert!(PACKAGE_QUERY.contains("ConvertTo-Json -InputObject $packages"));
        for forbidden in [
            "-AllUsers",
            "-Recurse",
            "auth.json",
            "Get-Content",
            "Invoke-Expression",
            "Start-Process",
        ] {
            assert!(!PACKAGE_QUERY.contains(forbidden), "unexpected {forbidden}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn desktop_only_windows_layout_uses_the_verified_runtime_and_recovers_after_removal() {
        use super::super::{Candidate, CodexSource, select_verified_candidate};
        use std::os::unix::fs::PermissionsExt;

        let directory = super::super::tests::test_directory("windows-desktop-only");
        let package = directory.join("MSIX with spaces");
        let executable = package.join("app/resources/codex.exe");
        fs::create_dir_all(executable.parent().unwrap()).unwrap();
        fs::write(
            &executable,
            "#!/bin/sh\n[ \"$1\" = --version ] || exit 1\nprintf 'codex-cli 0.151.0\\n'\n",
        )
        .unwrap();
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o700)).unwrap();
        let candidates: Vec<_> = candidates_from_roots(from_ref(&package), &[])
            .into_iter()
            .map(|path| Candidate {
                path,
                source: CodexSource::DesktopApp,
            })
            .collect();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let (selected, _) = runtime.block_on(select_verified_candidate(&candidates));
        let selected = selected.unwrap();
        assert_eq!(selected.launch.program, executable);
        assert!(selected.launch.prefix_args.is_empty());
        assert_eq!(selected.candidate.source, CodexSource::DesktopApp);

        fs::remove_file(executable).unwrap();
        let (selected, _) = runtime.block_on(select_verified_candidate(&candidates));
        assert!(selected.is_none());
        // An unavailable bundle does not hide a later valid fallback.
        let fallback = directory.join("codex");
        fs::write(&fallback, "#!/bin/sh\nprintf 'codex-cli 0.149.1\\n'\n").unwrap();
        fs::set_permissions(&fallback, fs::Permissions::from_mode(0o700)).unwrap();
        let mut candidates = candidates;
        candidates.push(Candidate {
            path: fallback.clone(),
            source: CodexSource::Path,
        });
        let (selected, _) = runtime.block_on(select_verified_candidate(&candidates));
        assert_eq!(selected.unwrap().launch.program, fallback);
        fs::remove_dir_all(directory).unwrap();
    }
}
