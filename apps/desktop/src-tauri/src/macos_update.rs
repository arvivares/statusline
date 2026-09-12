//! macOS updates without plugin installation, shell scripts, or elevation.
//!
//! The caller MUST authenticate `bytes` with the pinned Minisign key first.
//! Success preserves the previous app in a sibling `.statusline-backup-*`
//! directory. Backups are deliberately never automatically deleted: after an
//! interrupted replacement or failed rollback they may be the only working app.
//! Unwritable installations require a manual upgrade through the release page.
use crate::update_transaction::{EXECUTABLE, bundle_path};
use std::{
    fs,
    path::{Path, PathBuf},
};

/// Resolve an actual, ordinary `.app/Contents/MacOS/statusline-desktop` bundle.
/// Bundle/Contents/MacOS/executable/Info.plist symlinks are not accepted. Ancestor
/// aliases outside the bundle (such as /var on macOS) are canonicalized.
/// Cryptographic and plist identity verification happens again in `install`.
pub fn installed_bundle(executable: &Path) -> Option<PathBuf> {
    let bundle = bundle_path(executable)?;
    for directory in [
        &bundle,
        &bundle.join("Contents"),
        &bundle.join("Contents/MacOS"),
    ] {
        if !fs::symlink_metadata(directory).ok()?.file_type().is_dir() {
            return None;
        }
    }
    for file in [executable.to_owned(), bundle.join("Contents/Info.plist")] {
        if !fs::symlink_metadata(file).ok()?.file_type().is_file() {
            return None;
        }
    }
    let canonical_executable = executable.canonicalize().ok()?;
    let canonical_bundle = bundle.canonicalize().ok()?;
    (bundle_path(&canonical_executable)? == canonical_bundle).then_some(canonical_bundle)
}

#[cfg(target_os = "macos")]
pub use native::install;

#[cfg(target_os = "macos")]
mod native {
    use super::*;
    use crate::update_transaction::{self, BUNDLE_IDENTIFIER, ReplaceError};
    use flate2::read::GzDecoder;
    use std::{
        collections::HashSet,
        ffi::CString,
        io::{self, Read},
        os::unix::{
            ffi::OsStrExt,
            fs::{MetadataExt, PermissionsExt, symlink},
        },
        path::Component,
        process::{Command, Stdio},
    };

    const MAX_ARCHIVE_BYTES: usize = 512 * 1024 * 1024;
    const MAX_EXPANDED_BYTES: u64 = 1024 * 1024 * 1024;
    const MAX_ENTRIES: usize = 20_000;
    const MAX_METADATA_BYTES: u64 = 64 * 1024;
    const MAX_TAR_BYTES: u64 = MAX_EXPANDED_BYTES + MAX_ENTRIES as u64 * 1024;
    // codesign treats -R as a filename unless the requirement starts with '='.
    const APPLE_REQUIREMENT: &str = "=anchor apple generic";

    #[derive(Debug)]
    pub enum InstallError {
        ManualUpgrade,
        InvalidArchive(&'static str),
        InvalidBundle(&'static str),
        VerificationFailed,
        Io(io::Error),
        Transaction(ReplaceError),
    }
    impl std::fmt::Display for InstallError {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            match self {
                Self::ManualUpgrade => f.write_str("This installation requires a manual upgrade"),
                Self::InvalidArchive(reason) => write!(f, "Invalid update archive: {reason}"),
                Self::InvalidBundle(reason) => write!(f, "Invalid app bundle: {reason}"),
                Self::VerificationFailed => {
                    f.write_str("App signature or signing team verification failed")
                }
                Self::Io(error) => write!(f, "Update filesystem operation failed: {error}"),
                Self::Transaction(error) => error.fmt(f),
            }
        }
    }
    impl std::error::Error for InstallError {}
    impl From<io::Error> for InstallError {
        fn from(value: io::Error) -> Self {
            Self::Io(value)
        }
    }

    /// Install already-Minisign-verified bytes. Does not restart or delete backups.
    /// Missing/invalid signing teams (including ad-hoc signatures) fail closed.
    pub fn install(
        bytes: &[u8],
        current_bundle: &Path,
        expected_version: &str,
    ) -> Result<(), InstallError> {
        install_verified(
            bytes,
            current_bundle,
            expected_version,
            verify_bundle,
            rename_exclusive,
        )
    }

    fn install_verified(
        bytes: &[u8],
        current: &Path,
        expected_version: &str,
        mut verify: impl FnMut(&Path) -> Result<String, InstallError>,
        rename: impl FnMut(&Path, &Path) -> io::Result<()>,
    ) -> Result<(), InstallError> {
        let executable = current.join("Contents/MacOS").join(EXECUTABLE);
        if installed_bundle(&executable).as_deref() != Some(current) {
            return Err(InstallError::InvalidBundle("expected canonical app layout"));
        }
        let original = fs::symlink_metadata(current)?;
        let parent = current.parent().ok_or(InstallError::ManualUpgrade)?;
        // Creation checks actual permissions/ACLs and stages on the same volume.
        // No permission changes or privilege prompts are attempted on failure.
        let stage = tempfile::Builder::new()
            .prefix(".statusline-stage-")
            .tempdir_in(parent)
            .map_err(|_| InstallError::ManualUpgrade)?;
        let old_team = verify(current)?;
        let staged_bundle = extract_archive(bytes, stage.path())?;
        let new_team = verify(&staged_bundle)?;
        if expected_version.is_empty()
            || plist_value(&staged_bundle, "CFBundleShortVersionString")? != expected_version
        {
            return Err(InstallError::InvalidBundle("manifest version mismatch"));
        }
        if old_team.is_empty() || old_team != new_team {
            return Err(InstallError::VerificationFailed);
        }
        // Do not replace a changed bundle or a newly introduced symlink.
        let now = fs::symlink_metadata(current)?;
        if !now.is_dir()
            || original.dev() != now.dev()
            || original.ino() != now.ino()
            || installed_bundle(&executable).as_deref() != Some(current)
        {
            return Err(InstallError::InvalidBundle("installed bundle changed"));
        }
        let backup_directory = tempfile::Builder::new()
            .prefix(".statusline-backup-")
            .tempdir_in(parent)
            .map_err(|_| InstallError::ManualUpgrade)?;
        // Relinquish automatic cleanup BEFORE moving any original app into it.
        let backup = backup_directory
            .keep()
            .join(current.file_name().ok_or(InstallError::ManualUpgrade)?);
        update_transaction::replace_bundle(current, &staged_bundle, &backup, rename)
            .map_err(InstallError::Transaction)
    }

    /// Unlike std::fs::rename, this never overwrites a destination that appeared
    /// between validation and commit, including during rollback.
    fn rename_exclusive(from: &Path, to: &Path) -> io::Result<()> {
        let from =
            CString::new(from.as_os_str().as_bytes()).map_err(|_| io::ErrorKind::InvalidInput)?;
        let to =
            CString::new(to.as_os_str().as_bytes()).map_err(|_| io::ErrorKind::InvalidInput)?;
        // SAFETY: both strings are NUL-terminated and live throughout the call.
        if unsafe { libc::renamex_np(from.as_ptr(), to.as_ptr(), libc::RENAME_EXCL) } == 0 {
            Ok(())
        } else {
            Err(io::Error::last_os_error())
        }
    }

    fn archive_reader(bytes: &[u8]) -> io::Take<GzDecoder<&[u8]>> {
        GzDecoder::new(bytes).take(MAX_TAR_BYTES + 1)
    }

    // First inspect raw headers, before tar allocates GNU/PAX extension bodies.
    // The second pass can then safely use tar's long-name/PAX path handling.
    fn preflight(bytes: &[u8]) -> Result<(), InstallError> {
        if bytes.is_empty() || bytes.len() > MAX_ARCHIVE_BYTES {
            return Err(InstallError::InvalidArchive("compressed size limit"));
        }
        let mut archive = tar::Archive::new(archive_reader(bytes));
        let mut expanded = 0u64;
        for (index, entry) in archive.entries()?.raw(true).enumerate() {
            let entry = entry?;
            let kind = entry.header().entry_type();
            let metadata =
                kind.is_gnu_longname() || kind.is_gnu_longlink() || kind.is_pax_local_extensions();
            if index >= MAX_ENTRIES
                || !(metadata || kind.is_file() || kind.is_dir() || kind.is_symlink())
                || (metadata && entry.size() > MAX_METADATA_BYTES)
            {
                return Err(InstallError::InvalidArchive(
                    "unsupported entry or metadata limit",
                ));
            }
            expanded = expanded
                .checked_add(entry.size())
                .ok_or(InstallError::InvalidArchive("expanded size overflow"))?;
            if expanded > MAX_EXPANDED_BYTES {
                return Err(InstallError::InvalidArchive("expanded size limit"));
            }
        }
        // Drain through the gzip footer to catch truncation/CRC errors, bounded
        // even when there is padding or hidden data after tar's end markers.
        let mut reader = archive.into_inner();
        io::copy(&mut reader, &mut io::sink())?;
        if reader.limit() == 0 {
            return Err(InstallError::InvalidArchive("tar size limit"));
        }
        Ok(())
    }

    fn relative_entry(path: &Path) -> Result<PathBuf, InstallError> {
        let mut clean = PathBuf::new();
        for component in path.components() {
            match component {
                Component::CurDir => {}
                Component::Normal(value) => clean.push(value),
                _ => {
                    return Err(InstallError::InvalidArchive(
                        "absolute or escaping entry path",
                    ));
                }
            }
        }
        let root = clean
            .components()
            .next()
            .ok_or(InstallError::InvalidArchive("empty entry path"))?;
        let root = Path::new(root.as_os_str());
        if root.extension().is_none_or(|ext| ext != "app")
            || root.file_stem().is_none_or(|stem| stem.is_empty())
        {
            return Err(InstallError::InvalidArchive("expected one app root"));
        }
        Ok(clean)
    }

    fn link_destination(link: &Path, target: &Path) -> Result<PathBuf, InstallError> {
        let root = link
            .components()
            .next()
            .ok_or(InstallError::InvalidArchive("empty link path"))?;
        let mut result = link
            .parent()
            .ok_or(InstallError::InvalidArchive("root symlink"))?
            .to_owned();
        if target.as_os_str().is_empty() {
            return Err(InstallError::InvalidArchive("empty symlink"));
        }
        for part in target.components() {
            match part {
                Component::Normal(value) => result.push(value),
                Component::CurDir => {}
                Component::ParentDir if result.components().count() > 1 => {
                    result.pop();
                }
                _ => return Err(InstallError::InvalidArchive("escaping symlink")),
            }
        }
        if !result.starts_with(root.as_os_str()) {
            return Err(InstallError::InvalidArchive("foreign symlink"));
        }
        Ok(result)
    }

    /// Never traverse artifact symlinks, including case/Unicode aliases on APFS.
    fn directories(stage: &Path, relative: &Path) -> Result<(), InstallError> {
        let mut directory = stage.to_owned();
        for part in relative.components() {
            let Component::Normal(part) = part else {
                return Err(InstallError::InvalidArchive("invalid directory"));
            };
            directory.push(part);
            match fs::symlink_metadata(&directory) {
                Ok(metadata) if metadata.file_type().is_dir() => {}
                Ok(_) => return Err(InstallError::InvalidArchive("non-directory ancestor")),
                Err(error) if error.kind() == io::ErrorKind::NotFound => {
                    fs::create_dir(&directory)?
                }
                Err(error) => return Err(error.into()),
            }
        }
        Ok(())
    }

    fn extract_archive(bytes: &[u8], stage: &Path) -> Result<PathBuf, InstallError> {
        preflight(bytes)?;
        let mut archive = tar::Archive::new(archive_reader(bytes));
        let mut paths = HashSet::new();
        let mut root: Option<PathBuf> = None;
        let mut links = Vec::new();
        let mut expanded = 0u64;
        for (index, entry) in archive.entries()?.enumerate() {
            let mut entry = entry?;
            let relative = relative_entry(&entry.path()?)?;
            let entry_root = PathBuf::from(relative.components().next().unwrap().as_os_str());
            if index >= MAX_ENTRIES
                || !paths.insert(relative.clone())
                || root.as_ref().is_some_and(|root| *root != entry_root)
            {
                return Err(InstallError::InvalidArchive(
                    "duplicate entry, multiple roots or entry limit",
                ));
            }
            root = Some(entry_root);
            let destination = stage.join(&relative);
            let kind = entry.header().entry_type();
            if kind.is_dir() {
                directories(stage, &relative)?;
            } else if kind.is_file() {
                expanded = expanded
                    .checked_add(entry.size())
                    .ok_or(InstallError::InvalidArchive("expanded size overflow"))?;
                if expanded > MAX_EXPANDED_BYTES {
                    return Err(InstallError::InvalidArchive("expanded size limit"));
                }
                directories(stage, relative.parent().unwrap())?;
                // No artifact links exist yet. create_new also rejects aliases
                // and duplicate files on case-insensitive/Unicode-normalizing volumes.
                let mut file = fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&destination)?;
                let expected = entry.size();
                let mode = if entry.header().mode()? & 0o111 != 0 {
                    0o755
                } else {
                    0o644
                };
                if io::copy(&mut entry, &mut file)? != expected {
                    return Err(InstallError::InvalidArchive("truncated file"));
                }
                file.set_permissions(fs::Permissions::from_mode(mode))?;
                file.sync_all()?;
            } else if kind.is_symlink() {
                let target = entry
                    .link_name()?
                    .ok_or(InstallError::InvalidArchive("missing symlink target"))?
                    .into_owned();
                link_destination(&relative, &target)?;
                links.push((relative, target));
            } else {
                return Err(InstallError::InvalidArchive("unsupported entry type"));
            }
        }
        let bundle = stage.join(root.ok_or(InstallError::InvalidArchive("empty archive"))?);
        if !fs::symlink_metadata(&bundle)?.is_dir() {
            return Err(InstallError::InvalidArchive("root is not a directory"));
        }
        // Reject writes beneath any link (even links to other in-bundle paths).
        // This also makes link creation independent of archive entry ordering.
        for (link, _) in &links {
            if paths
                .iter()
                .any(|entry| entry != link && entry.starts_with(link))
            {
                return Err(InstallError::InvalidArchive("entry beneath a symlink"));
            }
        }
        for (link, target) in &links {
            let destination = stage.join(link);
            directories(stage, link.parent().unwrap())?;
            symlink(target, destination)?;
        }
        let canonical_bundle = bundle.canonicalize()?;
        for (link, _) in &links {
            // Reject dangling links, cycles, and indirect escape through chains.
            if !stage
                .join(link)
                .canonicalize()?
                .starts_with(&canonical_bundle)
            {
                return Err(InstallError::InvalidArchive("symlink escapes app"));
            }
        }
        if installed_bundle(&bundle.join("Contents/MacOS").join(EXECUTABLE)).as_deref()
            != Some(&canonical_bundle)
        {
            return Err(InstallError::InvalidBundle(
                "missing ordinary executable or plist",
            ));
        }
        Ok(canonical_bundle)
    }

    fn command_output(
        program: &str,
        args: &[&str],
        path: &Path,
    ) -> Result<std::process::Output, InstallError> {
        let output = Command::new(program)
            .args(args)
            .arg(path)
            .stdin(Stdio::null())
            .output()?;
        if !output.status.success() {
            #[cfg(test)]
            eprintln!(
                "Read-only verification command {program} {args:?} failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            return Err(InstallError::VerificationFailed);
        }
        Ok(output)
    }

    fn plist_value(bundle: &Path, key: &str) -> Result<String, InstallError> {
        let output = command_output(
            "/usr/bin/plutil",
            &["-extract", key, "raw", "-o", "-"],
            &bundle.join("Contents/Info.plist"),
        )?;
        String::from_utf8(output.stdout)
            .map(|value| value.trim_end_matches(['\r', '\n']).to_owned())
            .map_err(|_| InstallError::VerificationFailed)
    }

    fn signing_team(details: &str) -> Result<String, InstallError> {
        let mut identifiers = details
            .lines()
            .filter_map(|line| line.strip_prefix("Identifier="));
        let mut teams = details
            .lines()
            .filter_map(|line| line.strip_prefix("TeamIdentifier="));
        let team = teams.next().ok_or(InstallError::VerificationFailed)?;
        if identifiers.next() != Some(BUNDLE_IDENTIFIER)
            || identifiers.next().is_some()
            || teams.next().is_some()
            || team.len() != 10
            || !team
                .bytes()
                .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit())
        {
            return Err(InstallError::VerificationFailed);
        }
        Ok(team.to_owned())
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use flate2::{Compression, write::GzEncoder};

        const ROOT: &str = "状态 line.app";
        const PLIST: &[u8] = b"<?xml version=\"1.0\"?><plist version=\"1.0\"><dict><key>CFBundleIdentifier</key><string>inmerzion.statusline.desktop</string><key>CFBundleExecutable</key><string>statusline-desktop</string><key>CFBundleShortVersionString</key><string>0.1.18</string></dict></plist>";
        type Member<'a> = (&'a str, tar::EntryType, &'a [u8], Option<&'a str>);

        #[test]
        fn apple_requirement_is_evaluated_as_code_not_a_filename() {
            // A real read-only Apple-signed executable catches argument parsing
            // errors that mocked signature checks cannot detect.
            command_output(
                "/usr/bin/codesign",
                &["--verify", "--strict", "-R", APPLE_REQUIREMENT],
                Path::new("/usr/bin/true"),
            )
            .unwrap();
        }

        #[test]
        fn apple_requirement_rejects_an_adhoc_signed_binary() {
            let fixture = tempfile::tempdir().unwrap();
            let binary = fixture.path().join("adhoc");
            fs::copy("/usr/bin/true", &binary).unwrap();
            command_output("/usr/bin/codesign", &["--force", "--sign", "-"], &binary).unwrap();
            assert!(
                command_output(
                    "/usr/bin/codesign",
                    &["--verify", "--strict", "-R", APPLE_REQUIREMENT],
                    &binary,
                )
                .is_err()
            );
        }

        #[test]
        #[ignore = "Requires an independently signature-verified release archive and installed signed app; only temporary copies are replaced"]
        fn signed_release_upgrade_rehearsal() {
            let source = PathBuf::from(std::env::var_os("STATUSLINE_TEST_MACOS_APP").unwrap());
            let archive = PathBuf::from(std::env::var_os("STATUSLINE_TEST_MACOS_ARCHIVE").unwrap());
            let version = std::env::var("STATUSLINE_TEST_MACOS_VERSION").unwrap();
            let fixture = tempfile::tempdir().unwrap();
            let current = fixture.path().join("Statusline Test.app");
            let result = Command::new("/usr/bin/ditto")
                .arg(&source)
                .arg(&current)
                .status()
                .unwrap();
            assert!(result.success());
            let current = current.canonicalize().unwrap();
            let old_team = verify_bundle(&current).unwrap();
            install(&fs::read(archive).unwrap(), &current, &version).unwrap();
            assert_eq!(verify_bundle(&current).unwrap(), old_team);
            assert_eq!(
                plist_value(&current, "CFBundleShortVersionString").unwrap(),
                version
            );
            let backup = fs::read_dir(fixture.path())
                .unwrap()
                .map(|entry| entry.unwrap().path())
                .find(|path| {
                    path.file_name()
                        .unwrap()
                        .to_string_lossy()
                        .starts_with(".statusline-backup-")
                })
                .unwrap()
                .join("Statusline Test.app")
                .canonicalize()
                .unwrap();
            assert_eq!(verify_bundle(&backup).unwrap(), old_team);
            // The real app, its settings and the running process were never changed.
            assert_eq!(
                verify_bundle(&source.canonicalize().unwrap()).unwrap(),
                old_team
            );
        }

        fn archive(extra: &[Member<'_>]) -> Vec<u8> {
            let mut builder = tar::Builder::new(GzEncoder::new(Vec::new(), Compression::fast()));
            let executable = format!("{ROOT}/Contents/MacOS/{EXECUTABLE}");
            let plist = format!("{ROOT}/Contents/Info.plist");
            let entries = [
                (
                    executable.as_str(),
                    tar::EntryType::Regular,
                    b"new executable".as_slice(),
                    None,
                ),
                (plist.as_str(), tar::EntryType::Regular, PLIST, None),
            ];
            for &(path, kind, body, link) in entries.iter().chain(extra) {
                let mut header = tar::Header::new_gnu();
                // Raw header permits intentionally hostile test paths.
                assert!(path.len() < 100);
                header.as_mut_bytes()[..path.len()].copy_from_slice(path.as_bytes());
                header.set_entry_type(kind);
                header.set_size(body.len() as u64);
                header.set_mode(0o755);
                if let Some(link) = link {
                    header.set_link_name(link).unwrap();
                }
                header.set_cksum();
                builder.append(&header, body).unwrap();
            }
            builder.into_inner().unwrap().finish().unwrap()
        }

        fn current(parent: &Path) -> PathBuf {
            let bundle = parent.join("José's 状态.app");
            fs::create_dir_all(bundle.join("Contents/MacOS")).unwrap();
            fs::write(bundle.join("Contents/MacOS").join(EXECUTABLE), b"original").unwrap();
            fs::write(bundle.join("Contents/Info.plist"), PLIST).unwrap();
            bundle.canonicalize().unwrap()
        }

        #[test]
        fn layout_accepts_unicode_but_rejects_bundle_and_executable_symlinks() {
            let fixture = tempfile::tempdir().unwrap();
            let bundle = current(fixture.path());
            let executable = bundle.join("Contents/MacOS").join(EXECUTABLE);
            assert_eq!(installed_bundle(&executable), Some(bundle.clone()));
            let alias = fixture.path().join("Alias.app");
            symlink(&bundle, &alias).unwrap();
            assert!(installed_bundle(&alias.join("Contents/MacOS").join(EXECUTABLE)).is_none());
            fs::rename(&executable, executable.with_extension("real")).unwrap();
            symlink(executable.with_extension("real"), &executable).unwrap();
            assert!(installed_bundle(&executable).is_none());
        }

        #[test]
        fn extracts_unicode_bundle_and_safe_internal_symlink() {
            let fixture = tempfile::tempdir().unwrap();
            let target = format!("{ROOT}/Contents/Resources/data");
            let link = format!("{ROOT}/Contents/Resources/current");
            let bytes = archive(&[
                (&target, tar::EntryType::Regular, b"asset", None),
                (&link, tar::EntryType::Symlink, b"", Some("data")),
            ]);
            let bundle = extract_archive(&bytes, fixture.path()).unwrap();
            assert_eq!(
                fs::read(bundle.join("Contents/Resources/current")).unwrap(),
                b"asset"
            );
        }

        #[test]
        fn rejects_escape_multiple_roots_duplicate_hardlink_and_device() {
            let link = format!("{ROOT}/Contents/Resources/link");
            let duplicate = format!("{ROOT}/Contents/Info.plist");
            for extra in [
                ("/escape", tar::EntryType::Regular, b"x".as_slice(), None),
                ("../escape", tar::EntryType::Regular, b"x".as_slice(), None),
                (
                    "Other.app/file",
                    tar::EntryType::Regular,
                    b"x".as_slice(),
                    None,
                ),
                (
                    "状态 line.app/../escape",
                    tar::EntryType::Regular,
                    b"x".as_slice(),
                    None,
                ),
                (&duplicate, tar::EntryType::Regular, b"x".as_slice(), None),
                (&link, tar::EntryType::Symlink, b"".as_slice(), Some("/tmp")),
                (
                    &link,
                    tar::EntryType::Symlink,
                    b"".as_slice(),
                    Some("../../../outside"),
                ),
                (
                    &link,
                    tar::EntryType::Symlink,
                    b"".as_slice(),
                    Some("missing"),
                ),
                (&link, tar::EntryType::Symlink, b"".as_slice(), Some("link")),
                (
                    &link,
                    tar::EntryType::Link,
                    b"".as_slice(),
                    Some("Info.plist"),
                ),
                (&link, tar::EntryType::Char, b"".as_slice(), None),
            ] {
                let fixture = tempfile::tempdir().unwrap();
                assert!(
                    extract_archive(&archive(&[extra]), fixture.path()).is_err(),
                    "{}",
                    extra.0
                );
            }
        }

        #[test]
        fn refuses_writes_beneath_links_regardless_of_order() {
            let link = format!("{ROOT}/Contents/Resources/link");
            let child = format!("{link}/child");
            let entries = [
                (
                    &link[..],
                    tar::EntryType::Symlink,
                    b"".as_slice(),
                    Some("."),
                ),
                (&child[..], tar::EntryType::Regular, b"x".as_slice(), None),
            ];
            for extra in [entries, [entries[1], entries[0]]] {
                let fixture = tempfile::tempdir().unwrap();
                assert!(extract_archive(&archive(&extra), fixture.path()).is_err());
            }
            // Directory traversal never follows an already-created link either.
            let fixture = tempfile::tempdir().unwrap();
            symlink("/tmp", fixture.path().join("link")).unwrap();
            assert!(directories(fixture.path(), Path::new("link/subdirectory")).is_err());
        }

        #[test]
        fn rejects_oversized_extension_and_truncated_gzip() {
            let oversized = vec![b'x'; MAX_METADATA_BYTES as usize + 1];
            assert!(
                preflight(&archive(&[(
                    "metadata",
                    tar::EntryType::XHeader,
                    &oversized,
                    None
                )]))
                .is_err()
            );
            let mut bytes = archive(&[]);
            bytes.truncate(bytes.len() - 8);
            assert!(preflight(&bytes).is_err());
        }

        #[test]
        fn signing_details_require_exact_identifier_and_unambiguous_team() {
            assert_eq!(
                signing_team(
                    "Identifier=inmerzion.statusline.desktop\nTeamIdentifier=ABCDE12345\n"
                )
                .unwrap(),
                "ABCDE12345"
            );
            for details in [
                "Identifier=other\nTeamIdentifier=ABCDE12345\n",
                "Identifier=inmerzion.statusline.desktop\nTeamIdentifier=not set\n",
                "Identifier=inmerzion.statusline.desktop\n",
                "Identifier=inmerzion.statusline.desktop\nTeamIdentifier=ABCDE12345\nTeamIdentifier=OTHER12345\n",
            ] {
                assert!(signing_team(details).is_err());
            }
        }

        #[test]
        fn version_and_team_mismatches_fail_before_rename() {
            for (expected, mismatch_team) in [("0.1.19", false), ("0.1.18", true)] {
                let fixture = tempfile::tempdir().unwrap();
                let bundle = current(fixture.path());
                let mut calls = 0;
                let result = install_verified(
                    &archive(&[]),
                    &bundle,
                    expected,
                    |_| {
                        calls += 1;
                        Ok(if mismatch_team && calls == 2 {
                            "OTHER12345"
                        } else {
                            "ABCDE12345"
                        }
                        .into())
                    },
                    |_, _| panic!("must not rename mismatched app"),
                );
                assert!(result.is_err());
                assert_eq!(
                    fs::read(bundle.join("Contents/MacOS").join(EXECUTABLE)).unwrap(),
                    b"original"
                );
            }
        }

        #[test]
        fn real_filesystem_transaction_preserves_original_on_success_and_each_failure() {
            for fail in [0, 2, 3] {
                let fixture = tempfile::tempdir().unwrap();
                let bundle = current(fixture.path());
                let mut calls = 0;
                let result = install_verified(
                    &archive(&[]),
                    &bundle,
                    "0.1.18",
                    |_| Ok("ABCDE12345".into()),
                    |from, to| {
                        calls += 1;
                        if (fail == 2 && calls == 2) || (fail == 3 && calls >= 2) {
                            return Err(io::Error::other("injected rename failure"));
                        }
                        rename_exclusive(from, to)
                    },
                );
                if fail == 2 {
                    assert!(matches!(
                        result,
                        Err(InstallError::Transaction(ReplaceError::Replacement(_)))
                    ));
                    assert_eq!(
                        fs::read(bundle.join("Contents/MacOS").join(EXECUTABLE)).unwrap(),
                        b"original"
                    );
                } else {
                    if fail == 0 {
                        result.unwrap();
                        assert_eq!(
                            fs::read(bundle.join("Contents/MacOS").join(EXECUTABLE)).unwrap(),
                            b"new executable"
                        );
                    } else {
                        assert!(matches!(
                            result,
                            Err(InstallError::Transaction(ReplaceError::Rollback { .. }))
                        ));
                        assert!(!bundle.exists());
                    }
                    let backup = fs::read_dir(fixture.path())
                        .unwrap()
                        .map(|entry| entry.unwrap().path())
                        .find(|path| {
                            path.file_name()
                                .unwrap()
                                .to_string_lossy()
                                .starts_with(".statusline-backup-")
                        })
                        .unwrap();
                    assert_eq!(
                        fs::read(
                            backup
                                .join(bundle.file_name().unwrap())
                                .join("Contents/MacOS")
                                .join(EXECUTABLE)
                        )
                        .unwrap(),
                        b"original"
                    );
                }
            }
        }

        #[test]
        fn exclusive_rename_preserves_existing_destination() {
            let fixture = tempfile::tempdir().unwrap();
            let source = fixture.path().join("source");
            let destination = fixture.path().join("destination");
            fs::write(&source, b"old").unwrap();
            fs::write(&destination, b"other").unwrap();
            assert!(rename_exclusive(&source, &destination).is_err());
            assert_eq!(fs::read(source).unwrap(), b"old");
            assert_eq!(fs::read(destination).unwrap(), b"other");
        }
    }

    fn verify_bundle(bundle: &Path) -> Result<String, InstallError> {
        if installed_bundle(&bundle.join("Contents/MacOS").join(EXECUTABLE)).as_deref()
            != Some(bundle)
            || plist_value(bundle, "CFBundleIdentifier")? != BUNDLE_IDENTIFIER
            || plist_value(bundle, "CFBundleExecutable")? != EXECUTABLE
        {
            return Err(InstallError::InvalidBundle(
                "bundle identity or executable mismatch",
            ));
        }
        let executable = bundle.join("Contents/MacOS").join(EXECUTABLE);
        if fs::metadata(&executable)?.permissions().mode() & 0o111 == 0 {
            return Err(InstallError::InvalidBundle("executable permission missing"));
        }
        // Only read-only Apple tools; no Gatekeeper network assessment, signing,
        // installer execution, shell interpolation, or privilege escalation.
        command_output(
            "/usr/bin/codesign",
            &[
                "--verify",
                "--deep",
                "--strict",
                "--all-architectures",
                "-R",
                APPLE_REQUIREMENT,
            ],
            bundle,
        )?;
        let details = command_output("/usr/bin/codesign", &["--display", "--verbose=4"], bundle)?;
        signing_team(
            std::str::from_utf8(&details.stderr).map_err(|_| InstallError::VerificationFailed)?,
        )
    }
}
