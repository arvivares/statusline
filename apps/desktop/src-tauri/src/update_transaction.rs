//! Platform-independent path policy and fault-injectable bundle replacement.
//!
//! The caller reserves an empty, persistent backup location on the same volume.
//! Nothing here deletes a backup, including after success or failed rollback.
use std::{
    io,
    path::{Component, Path, PathBuf},
};

pub const EXECUTABLE: &str = "statusline-desktop";
pub const BUNDLE_IDENTIFIER: &str = "inmerzion.statusline.desktop";

/// Lexical policy only; callers must also inspect/canonicalize the filesystem.
pub fn bundle_path(executable: &Path) -> Option<PathBuf> {
    if !executable.is_absolute()
        || executable
            .components()
            .any(|part| matches!(part, Component::ParentDir | Component::CurDir))
        || executable.file_name()? != EXECUTABLE
    {
        return None;
    }
    let macos = executable.parent()?;
    let contents = macos.parent()?;
    let bundle = contents.parent()?;
    if macos.file_name()? != "MacOS"
        || contents.file_name()? != "Contents"
        || bundle.extension()? != "app"
        || bundle.file_stem()?.is_empty()
    {
        return None;
    }
    Some(bundle.to_owned())
}

#[derive(Debug)]
pub enum ReplaceError {
    Backup(io::Error),
    /// The original is back at `current`.
    Replacement(io::Error),
    /// The original remains at `backup`; manual recovery is required.
    Rollback {
        replacement: io::Error,
        rollback: io::Error,
        backup: PathBuf,
    },
}

impl std::fmt::Display for ReplaceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Backup(error) => write!(f, "Could not back up the installed app: {error}"),
            Self::Replacement(error) => write!(f, "Replacement failed; original restored: {error}"),
            Self::Rollback {
                replacement,
                rollback,
                backup,
            } => write!(
                f,
                "Replacement failed ({replacement}); rollback failed ({rollback}); original preserved at {}",
                backup.display()
            ),
        }
    }
}
impl std::error::Error for ReplaceError {}

/// `rename` must never overwrite an existing destination (including on rollback).
/// On success the previous app remains in `backup`. If the process stops between
/// renames, that persistent backup is the recovery copy, never a temporary guard.
pub fn replace_bundle(
    current: &Path,
    staged: &Path,
    backup: &Path,
    mut rename: impl FnMut(&Path, &Path) -> io::Result<()>,
) -> Result<(), ReplaceError> {
    rename(current, backup).map_err(ReplaceError::Backup)?;
    if let Err(replacement) = rename(staged, current) {
        return match rename(backup, current) {
            Ok(()) => Err(ReplaceError::Replacement(replacement)),
            Err(rollback) => Err(ReplaceError::Rollback {
                replacement,
                rollback,
                backup: backup.to_owned(),
            }),
        };
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    #[test]
    fn accepts_spaces_and_unicode_in_bundle_and_parent() {
        let root = if cfg!(windows) {
            "C:/Applications"
        } else {
            "/Applications"
        };
        let expected = Path::new(root).join("José/状态 línea.app");
        assert_eq!(
            bundle_path(&expected.join("Contents/MacOS/statusline-desktop")),
            Some(expected)
        );
    }

    #[test]
    fn rejects_wrong_or_ambiguous_layouts() {
        for path in [
            "/tmp/statusline-desktop",
            "/tmp/release/statusline-desktop",
            "/Applications/Statusline/Contents/MacOS/statusline-desktop",
            "/Applications/Statusline.app/Other/MacOS/statusline-desktop",
            "/Applications/Statusline.app/Contents/Other/statusline-desktop",
            "/Applications/Statusline.app/Contents/MacOS/other",
            "/Applications/Statusline.app/Contents/MacOS/nested/statusline-desktop",
            "/Applications/../Statusline.app/Contents/MacOS/statusline-desktop",
            "Statusline.app/Contents/MacOS/statusline-desktop",
        ] {
            assert!(bundle_path(Path::new(path)).is_none(), "{path}");
        }
    }

    fn simulate(
        failures: &[usize],
    ) -> (
        Result<(), ReplaceError>,
        BTreeMap<PathBuf, &'static str>,
        usize,
    ) {
        let mut files = BTreeMap::from([
            (PathBuf::from("current"), "original"),
            (PathBuf::from("staged"), "verified update"),
        ]);
        let mut calls = 0;
        let result = replace_bundle(
            Path::new("current"),
            Path::new("staged"),
            Path::new("backup"),
            |from, to| {
                calls += 1;
                if failures.contains(&calls) {
                    return Err(io::Error::other("injected rename failure"));
                }
                if files.contains_key(to) {
                    return Err(io::ErrorKind::AlreadyExists.into());
                }
                let value = files.remove(from).ok_or(io::ErrorKind::NotFound)?;
                files.insert(to.to_owned(), value);
                Ok(())
            },
        );
        (result, files, calls)
    }

    #[test]
    fn success_keeps_the_original_backup() {
        let (result, files, calls) = simulate(&[]);
        assert!(result.is_ok());
        assert_eq!(calls, 2);
        assert_eq!(files[Path::new("current")], "verified update");
        assert_eq!(files[Path::new("backup")], "original");
    }

    #[test]
    fn failed_first_rename_leaves_original_untouched() {
        let (result, files, calls) = simulate(&[1]);
        assert!(matches!(result, Err(ReplaceError::Backup(_))));
        assert_eq!(calls, 1);
        assert_eq!(files[Path::new("current")], "original");
    }

    #[test]
    fn failed_second_rename_restores_original() {
        let (result, files, calls) = simulate(&[2]);
        assert!(matches!(result, Err(ReplaceError::Replacement(_))));
        assert_eq!(calls, 3);
        assert_eq!(files[Path::new("current")], "original");
        assert!(!files.contains_key(Path::new("backup")));
    }

    #[test]
    fn failed_rollback_preserves_the_only_original() {
        let (result, files, calls) = simulate(&[2, 3]);
        assert!(matches!(result, Err(ReplaceError::Rollback { .. })));
        assert_eq!(calls, 3);
        assert_eq!(files[Path::new("backup")], "original");
        assert!(!files.contains_key(Path::new("current")));
    }

    #[test]
    fn rollback_never_overwrites_a_new_occupant() {
        let mut files = BTreeMap::from([(PathBuf::from("current"), "original")]);
        let mut calls = 0;
        let result = replace_bundle(
            Path::new("current"),
            Path::new("staged"),
            Path::new("backup"),
            |from, to| {
                calls += 1;
                if calls == 2 {
                    files.insert(PathBuf::from("current"), "other occupant");
                    return Err(io::ErrorKind::AlreadyExists.into());
                }
                if files.contains_key(to) {
                    return Err(io::ErrorKind::AlreadyExists.into());
                }
                let value = files.remove(from).ok_or(io::ErrorKind::NotFound)?;
                files.insert(to.to_owned(), value);
                Ok(())
            },
        );
        assert!(matches!(result, Err(ReplaceError::Rollback { .. })));
        assert_eq!(files[Path::new("backup")], "original");
        assert_eq!(files[Path::new("current")], "other occupant");
    }
}
