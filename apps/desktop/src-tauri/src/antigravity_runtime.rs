//! One-shot, read-only vendor runtime. Credentials stay in the vendor's store.
use super::{Failure, Source, supported_cli_version};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use reqwest::{Certificate, Client, redirect::Policy, tls::TlsInfo};
use ring::rand::{SecureRandom, SystemRandom};
use serde_json::{Value, json};
#[cfg(windows)]
use std::path::PathBuf;
use std::{env, fs, path::Path, process::Stdio, time::Duration};
use tokio::{
    io::AsyncReadExt,
    process::{Child, Command},
    time::{sleep, timeout},
};

const LIMIT: u64 = 1024 * 1024;
const DEADLINE: Duration = Duration::from_secs(45);

// RAII covers cancellation and timeout, including helpers spawned by our child.
// Never attach to, signal, or repurpose a user's existing vendor process.
struct OwnedChild {
    child: Child,
    #[cfg(unix)]
    group: i32,
    #[cfg(windows)]
    job: isize,
}

impl OwnedChild {
    fn spawn(command: &mut Command) -> Result<Self, Failure> {
        command
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(unix)]
        command.process_group(0);
        #[cfg(windows)]
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let child = command.spawn().map_err(|_| Failure::SourceUnavailable)?;
        #[cfg(unix)]
        {
            let group = child.id().ok_or(Failure::SourceUnavailable)? as i32;
            Ok(Self { child, group })
        }
        #[cfg(windows)]
        {
            use windows_sys::Win32::{Foundation::CloseHandle, System::JobObjects::*};
            // Assignment uses the live process handle, not a reusable numeric PID.
            let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
            if job.is_null() {
                return Err(Failure::SourceUnavailable);
            }
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let assigned = unsafe {
                SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    &limits as *const _ as *const _,
                    std::mem::size_of_val(&limits) as u32,
                ) != 0
                    && child
                        .raw_handle()
                        .is_some_and(|handle| AssignProcessToJobObject(job, handle) != 0)
            };
            if !assigned {
                unsafe {
                    CloseHandle(job);
                }
                return Err(Failure::SourceUnavailable);
            }
            Ok(Self {
                child,
                job: job as isize,
            })
        }
    }

    fn alive(&mut self) -> Result<u32, Failure> {
        if self
            .child
            .try_wait()
            .map_err(|_| Failure::SourceUnavailable)?
            .is_some()
        {
            return Err(Failure::SourceUnavailable);
        }
        self.child.id().ok_or(Failure::SourceUnavailable)
    }

    async fn stop(&mut self) {
        self.terminate();
        let _ = timeout(Duration::from_secs(3), self.child.wait()).await;
    }

    fn terminate(&mut self) {
        #[cfg(unix)]
        {
            // Our detached group is created at spawn; never use discovered PIDs.
            if self.group > 0 {
                unsafe {
                    libc::kill(-self.group, libc::SIGKILL);
                }
                self.group = 0;
            }
        }
        #[cfg(windows)]
        {
            if self.job != 0 {
                unsafe {
                    windows_sys::Win32::Foundation::CloseHandle(self.job as _);
                }
                self.job = 0;
            }
        }
        let _ = self.child.start_kill();
    }
}

impl Drop for OwnedChild {
    fn drop(&mut self) {
        self.terminate();
    }
}

fn isolated_command(path: &Path, root: &Path) -> Command {
    let mut command = Command::new(path);
    command.env_clear().current_dir(root);
    // Preserve the real home / OS credential context; isolate only our transient
    // runtime data. Never copy auth files or forward API keys from Companion.
    for key in [
        "HOME",
        "USER",
        "LOGNAME",
        "LANG",
        "LC_CTYPE",
        "__CF_USER_TEXT_ENCODING",
        "USERPROFILE",
        "LOCALAPPDATA",
        "APPDATA",
        "SystemRoot",
        "WINDIR",
        "DBUS_SESSION_BUS_ADDRESS",
        "XDG_RUNTIME_DIR",
    ] {
        if let Some(value) = env::var_os(key) {
            command.env(key, value);
        }
    }
    #[cfg(unix)]
    command.env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin");
    #[cfg(windows)]
    if let Some(root) = env::var_os("SystemRoot") {
        command.env("PATH", PathBuf::from(root).join("System32"));
    }
    for (key, directory) in [
        ("XDG_CONFIG_HOME", "config"),
        ("XDG_CACHE_HOME", "cache"),
        ("XDG_STATE_HOME", "state"),
        ("TMPDIR", "tmp"),
        ("TMP", "tmp"),
        ("TEMP", "tmp"),
    ] {
        command.env(key, root.join(directory));
    }
    command
}

async fn output(command: &mut Command, deadline: Duration) -> Result<(bool, String), Failure> {
    command.stdout(Stdio::piped());
    let mut owned = OwnedChild::spawn(command)?;
    let result = timeout(deadline, async {
        let mut bytes = Vec::new();
        owned
            .child
            .stdout
            .take()
            .ok_or(Failure::SourceUnavailable)?
            .take(LIMIT + 1)
            .read_to_end(&mut bytes)
            .await
            .map_err(|_| Failure::SourceUnavailable)?;
        if bytes.len() as u64 > LIMIT {
            return Err(Failure::InvalidData);
        }
        let status = owned
            .child
            .wait()
            .await
            .map_err(|_| Failure::SourceUnavailable)?;
        Ok((
            status.success(),
            String::from_utf8(bytes).map_err(|_| Failure::InvalidData)?,
        ))
    })
    .await
    .map_err(|_| Failure::Timeout)
    .and_then(|v| v);
    owned.stop().await;
    result
}

pub(super) async fn read_usage(path: &Path, source: Source) -> Result<Value, Failure> {
    let root = tempfile::Builder::new()
        .prefix("statusline-agy-")
        .tempdir()
        .map_err(|_| Failure::SourceUnavailable)?;
    for name in ["config", "cache", "state", "tmp"] {
        fs::create_dir(root.path().join(name)).map_err(|_| Failure::SourceUnavailable)?;
    }
    timeout(DEADLINE, async {
        match source {
            Source::Cli => {
                let (ok, version) = output(
                    isolated_command(path, root.path()).arg("--version"),
                    Duration::from_secs(5),
                )
                .await?;
                if !ok || !supported_cli_version(&version) {
                    return Err(Failure::UnsupportedVersion);
                }
                let (ok, raw) = output(
                    isolated_command(path, root.path()).args([
                        "--print",
                        "/usage",
                        "--output-format",
                        "json",
                    ]),
                    Duration::from_secs(30),
                )
                .await?;
                if !ok {
                    return Err(Failure::NotSignedIn);
                }
                serde_json::from_str(&raw).map_err(|_| Failure::InvalidData)
            }
            Source::Desktop => desktop(path, root.path()).await,
        }
    })
    .await
    .map_err(|_| Failure::Timeout)?
}

#[cfg(target_os = "macos")]
async fn verify_vendor(path: &Path, root: &Path) -> Result<(), Failure> {
    // Designated signer requirement is evaluated by codesign, not string matching
    // untrusted output. Verification happens before executing any runtime flag.
    let (ok, _) = output(
        isolated_command(Path::new("/usr/bin/codesign"), root)
            .args([
                "--verify",
                "--strict",
                "-R=anchor apple generic and certificate leaf[subject.OU] = EQHXZ8M8AV",
            ])
            .arg(path),
        Duration::from_secs(5),
    )
    .await?;
    if ok {
        Ok(())
    } else {
        Err(Failure::UntrustedRuntime)
    }
}

#[cfg(not(target_os = "macos"))]
async fn verify_vendor(_path: &Path, _root: &Path) -> Result<(), Failure> {
    // No portable vendor-signature verifier is assumed. The opt-in setting
    // explicitly requires a trusted official installation on these platforms.
    Ok(())
}

fn metadata() -> Value {
    json!({"metadata":{"ideName":"antigravity","extensionName":"statusline","locale":"en"}})
}

async fn desktop(path: &Path, root: &Path) -> Result<Value, Failure> {
    verify_vendor(path, root).await?;
    // --help writes to stderr and is not a stable machine-readable contract.
    // Only the known read-only standalone flags/RPCs are used; shape/auth guards
    // fail closed if a vendor update changes this private interface.
    let mut random = [0u8; 32];
    SystemRandom::new()
        .fill(&mut random)
        .map_err(|_| Failure::SourceUnavailable)?;
    let csrf = URL_SAFE_NO_PAD.encode(random);
    // Unlike a detached process group alone, this vendor-supported parent pipe
    // also closes when the Unix host exits without running Rust destructors.
    // Windows has equivalent owner-lifetime cleanup through its Job Object.
    #[cfg(unix)]
    let parent_listener = tokio::net::UnixListener::bind(root.join("parent.sock"))
        .map_err(|_| Failure::SourceUnavailable)?;
    let mut command = isolated_command(path, root);
    #[cfg(unix)]
    command
        .arg("--parent_pipe_path")
        .arg(root.join("parent.sock"));
    command
        .args([
            "--standalone",
            "--override_ide_name",
            "antigravity",
            "--subclient_type",
            "hub",
            "--override_user_agent_name",
            "antigravity",
            "--https_server_port",
            "0",
            "--http_server_port",
            "0",
            "--csrf_token",
            &csrf,
            "--gemini_dir",
        ])
        .arg(root.join("state"))
        .args([
            "--app_data_dir",
            "antigravity",
            "--config_dir",
            "config",
            "--disable_telemetry",
            "--use_ls_chrome_devtools_mcp=false",
            "--use_local_chrome=false",
            "--enable_lsp=false",
            "--use_mocked_data=false",
            "--api_server_url",
            "https://generativelanguage.googleapis.com",
            "--cloud_code_endpoint",
            "https://daily-cloudcode-pa.googleapis.com",
        ])
        .stdout(Stdio::null());
    let mut owned = OwnedChild::spawn(&mut command)?;
    #[cfg(unix)]
    let _parent_connection = timeout(Duration::from_secs(8), parent_listener.accept())
        .await
        .map_err(|_| Failure::Timeout)?
        .map_err(|_| Failure::SourceUnavailable)?
        .0;
    let result = async {
        let mut connection = None;
        for _ in 0..40 {
            let ports = listeners(&mut owned, root).await?;
            for port in ports {
                // Certificate bootstrap sends NO session/CSRF/auth data, and only
                // to a loopback socket verified as belonging to our live child.
                let url = format!("https://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary");
                let bootstrap = Client::builder().no_proxy().redirect(Policy::none())
                    .timeout(Duration::from_millis(800)).tls_info(true)
                    .tls_danger_accept_invalid_certs(true).build().map_err(|_| Failure::SourceUnavailable)?;
                let Ok(response) = bootstrap.post(&url).json(&metadata()).send().await else { continue; };
                if response.status() != reqwest::StatusCode::UNAUTHORIZED { continue; }
                let der = response.extensions().get::<TlsInfo>().and_then(TlsInfo::peer_certificate)
                    .ok_or(Failure::UntrustedRuntime)?;
                let cert = Certificate::from_der(der).map_err(|_| Failure::UntrustedRuntime)?;
                if !listeners(&mut owned, root).await?.contains(&port) { return Err(Failure::UntrustedRuntime); }
                let client = Client::builder().no_proxy().redirect(Policy::none())
                    .timeout(Duration::from_secs(8)).tls_certs_only([cert])
                    .build().map_err(|_| Failure::SourceUnavailable)?;
                connection = Some((client, port)); break;
            }
            if connection.is_some() { break; }
            sleep(Duration::from_millis(250)).await;
        }
        let (client, port) = connection.ok_or(Failure::Timeout)?;
        let identity = rpc(&mut owned, root, &client, port, &csrf, "GetUserStatus").await?;
        // Only use identity for a boolean sign-in guard; never return it to UI,
        // logs, cache, or relay. No cross-source account matching is inferred.
        if !identity.pointer("/userStatus/email").and_then(Value::as_str).is_some_and(|v| v.contains('@'))
            || !identity.pointer("/userStatus/planStatus/planInfo/planName").and_then(Value::as_str).is_some_and(|v| !v.is_empty()) {
            return Err(Failure::NotSignedIn);
        }
        rpc(&mut owned, root, &client, port, &csrf, "RetrieveUserQuotaSummary").await
    }.await;
    owned.stop().await;
    result
}

async fn rpc(
    owned: &mut OwnedChild,
    root: &Path,
    client: &Client,
    port: u16,
    csrf: &str,
    method: &str,
) -> Result<Value, Failure> {
    if !["GetUserStatus", "RetrieveUserQuotaSummary"].contains(&method)
        || !listeners(owned, root).await?.contains(&port)
    {
        return Err(Failure::UntrustedRuntime);
    }
    let url =
        format!("https://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/{method}");
    let mut response = client
        .post(url)
        .header("Connect-Protocol-Version", "1")
        .header("X-Codeium-Csrf-Token", csrf)
        .json(&metadata())
        .send()
        .await
        .map_err(|_| Failure::SourceUnavailable)?;
    if matches!(response.status().as_u16(), 401 | 403) {
        return Err(Failure::NotSignedIn);
    }
    if !response.status().is_success() {
        return Err(Failure::SourceUnavailable);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| Failure::SourceUnavailable)?
    {
        if bytes.len() + chunk.len() > LIMIT as usize {
            return Err(Failure::InvalidData);
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| Failure::InvalidData)
}

async fn listeners(owned: &mut OwnedChild, root: &Path) -> Result<Vec<u16>, Failure> {
    let pid = owned.alive()?;
    #[cfg(target_os = "macos")]
    {
        let (_, raw) = output(
            isolated_command(Path::new("/usr/sbin/lsof"), root).args([
                "-nP",
                "-a",
                "-p",
                &pid.to_string(),
                "-iTCP",
                "-sTCP:LISTEN",
                "-Fn",
            ]),
            Duration::from_secs(2),
        )
        .await?;
        owned.alive()?;
        parse_lsof(&raw)
    }
    #[cfg(target_os = "linux")]
    {
        let _ = root;
        let mut inodes = std::collections::HashSet::new();
        for entry in fs::read_dir(format!("/proc/{pid}/fd"))
            .map_err(|_| Failure::SourceUnavailable)?
            .flatten()
        {
            if let Ok(path) = fs::read_link(entry.path()) {
                if let Some(value) = path
                    .to_str()
                    .and_then(|v| v.strip_prefix("socket:["))
                    .and_then(|v| v.strip_suffix(']'))
                {
                    inodes.insert(value.to_owned());
                }
            }
        }
        let mut ports = Vec::new();
        for table in ["tcp", "tcp6"] {
            let raw = fs::read_to_string(format!("/proc/{pid}/net/{table}"))
                .map_err(|_| Failure::SourceUnavailable)?;
            for line in raw.lines().skip(1) {
                let fields = line.split_whitespace().collect::<Vec<_>>();
                if fields.len() < 10 || fields[3] != "0A" || !inodes.contains(fields[9]) {
                    continue;
                }
                let (address, port) = fields[1].split_once(':').ok_or(Failure::UntrustedRuntime)?;
                if !["0100007F", "00000000000000000000000001000000"].contains(&address) {
                    return Err(Failure::UntrustedRuntime);
                }
                if address == "0100007F" {
                    ports.push(
                        u16::from_str_radix(port, 16).map_err(|_| Failure::UntrustedRuntime)?,
                    );
                }
            }
        }
        owned.alive()?;
        Ok(ports)
    }
    #[cfg(windows)]
    {
        let system = env::var_os("SystemRoot")
            .map(PathBuf::from)
            .ok_or(Failure::SourceUnavailable)?;
        let (_, raw) = output(
            isolated_command(&system.join("System32/netstat.exe"), root)
                .args(["-ano", "-p", "tcp"]),
            Duration::from_secs(2),
        )
        .await?;
        owned.alive()?;
        parse_netstat(&raw, pid)
    }
}

#[cfg(any(target_os = "macos", test))]
fn parse_lsof(raw: &str) -> Result<Vec<u16>, Failure> {
    let mut ports = Vec::new();
    for line in raw.lines().filter_map(|v| v.strip_prefix('n')) {
        if let Some(port) = line.strip_prefix("127.0.0.1:") {
            ports.push(port.parse().map_err(|_| Failure::UntrustedRuntime)?);
        } else if !line.starts_with("[::1]:") {
            return Err(Failure::UntrustedRuntime);
        }
    }
    Ok(ports)
}

#[cfg(any(windows, test))]
fn parse_netstat(raw: &str, pid: u32) -> Result<Vec<u16>, Failure> {
    let mut ports = Vec::new();
    for line in raw.lines() {
        let fields = line.split_whitespace().collect::<Vec<_>>();
        if fields.len() != 5
            || fields[0] != "TCP"
            || fields[4].parse::<u32>().ok() != Some(pid)
            || !["0.0.0.0:0", "[::]:0"].contains(&fields[2])
        {
            continue;
        }
        // Remote :0 identifies a listener independently of localized state text.
        if let Some(port) = fields[1].strip_prefix("127.0.0.1:") {
            ports.push(port.parse().map_err(|_| Failure::UntrustedRuntime)?);
        } else if !fields[1].starts_with("[::1]:") {
            return Err(Failure::UntrustedRuntime);
        }
    }
    Ok(ports)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn socket_owner_parsers_reject_public_binds() {
        assert_eq!(parse_lsof("p42\nn127.0.0.1:9001\n").unwrap(), [9001]);
        assert!(parse_lsof("n*:9001").is_err());
        assert_eq!(
            parse_netstat(
                "TCP 127.0.0.1:9001 0.0.0.0:0 ESCUCHANDO 42\nTCP 127.0.0.1:9 0.0.0.0:0 LISTENING 7",
                42
            )
            .unwrap(),
            [9001]
        );
        assert!(parse_netstat("TCP 0.0.0.0:9001 0.0.0.0:0 LISTENING 42", 42).is_err());
        assert!(parse_netstat("TCP [::]:9001 [::]:0 LISTENING 42", 42).is_err());
    }
    #[test]
    fn environment_does_not_forward_vendor_api_keys() {
        let command = isolated_command(Path::new("/fake/agy"), Path::new("/private/probe"));
        assert!(
            !command
                .as_std()
                .get_envs()
                .any(|(key, _)| key == "GOOGLE_API_KEY" || key == "GEMINI_API_KEY")
        );
    }
}
