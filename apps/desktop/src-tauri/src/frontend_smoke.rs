//! Linux frontend-readiness marker, independent of GTK so its file semantics
//! can be tested cheaply without building or launching the desktop application.

use std::{fs::OpenOptions, io::Write, path::Path};

pub fn write_ready_marker(path: &Path) -> std::io::Result<()> {
    // Do not overwrite a stale marker or follow a symlink to a user's file.
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(b"ready\n")
}

#[cfg(test)]
mod tests {
    use super::write_ready_marker;
    use std::{fs, io::ErrorKind, path::PathBuf, time::SystemTime};

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "statusline-frontend-marker-test-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[test]
    fn writes_exact_ready_payload_once() {
        let fixture = Fixture::new();
        let path = fixture.0.join("ready");
        write_ready_marker(&path).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"ready\n");
        assert_eq!(
            write_ready_marker(&path).unwrap_err().kind(),
            ErrorKind::AlreadyExists
        );
    }

    #[test]
    fn preserves_existing_file_contents() {
        let fixture = Fixture::new();
        let path = fixture.0.join("ready");
        fs::write(&path, b"existing data").unwrap();
        assert_eq!(
            write_ready_marker(&path).unwrap_err().kind(),
            ErrorKind::AlreadyExists
        );
        assert_eq!(fs::read(&path).unwrap(), b"existing data");
    }

    #[cfg(unix)]
    #[test]
    fn does_not_follow_symlinks() {
        let fixture = Fixture::new();
        let target = fixture.0.join("user-file");
        let marker = fixture.0.join("ready");
        fs::write(&target, b"unchanged").unwrap();
        std::os::unix::fs::symlink(&target, &marker).unwrap();
        assert!(write_ready_marker(&marker).is_err());
        assert_eq!(fs::read(&target).unwrap(), b"unchanged");
    }
}
