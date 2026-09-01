interface PublicPage {
  readonly title: string;
  readonly eyebrow: string;
  readonly summary: string;
  readonly content: string;
}

const pages: Readonly<Record<string, PublicPage>> = {
  "/": {
    title: "Statusline",
    eyebrow: "STL / DATA PLANE",
    summary: "Private, cross-platform Codex quota telemetry.",
    content: `
      <section>
        <h2>One status line. Every device.</h2>
        <p>Statusline reads quota metadata from your local Codex session and can relay an end-to-end encrypted snapshot to your phone. The relay never receives your Codex credentials or encryption key.</p>
      </section>
      <nav class="action-grid" aria-label="Public information">
        <a class="action" href="/privacy"><span>PRIVACY</span><strong>How data is handled</strong></a>
        <a class="action" href="/support"><span>SUPPORT</span><strong>Setup and troubleshooting</strong></a>
        <a class="action" href="/delete-data"><span>DATA CONTROL</span><strong>Delete Statusline data</strong></a>
      </nav>
    `,
  },
  "/privacy": {
    title: "Privacy Policy",
    eyebrow: "STL / PRIVACY",
    summary: "Effective 31 August 2026",
    content: `
      <section>
        <h2>Data processed locally</h2>
        <p>The desktop companion starts the locally installed Codex App Server and reads only the fields needed to show usage windows, reset times, account type and plan. It does not read, copy or store Codex access tokens, API keys, prompts, source code or conversation content.</p>
        <p>A manually selected Codex executable path stays in the computer's local application configuration and can be cleared from Source Settings.</p>
      </section>
      <section>
        <h2>Universal encrypted relay</h2>
        <p>Sync is optional. Pairing creates an AES-256 encryption key on the desktop and transfers it directly to the mobile device with a short-lived, single-use credential. Publisher and reader credentials are role-separated and stored in the operating system secure store.</p>
        <p>The relay receives a random channel identifier, SHA-256 hashes of random credentials, an opaque AES-256-GCM ciphertext and timestamps required for expiration and replay protection. It cannot decrypt the quota snapshot and never receives Codex credentials, email addresses, prompts or source code.</p>
      </section>
      <section>
        <h2>QR scanning on Android</h2>
        <p>Camera frames and decoded QR contents are processed on-device. Statusline does not store or transmit them. The bundled ML Kit barcode component may collect device and app information, an installation identifier, API configuration, feature events, performance measurements and error diagnostics for Google's diagnostics and usage analytics. Statusline does not receive that telemetry.</p>
        <p><a href="https://developers.google.com/ml-kit/android-data-disclosure" rel="noreferrer">Read Google's ML Kit data disclosure</a>.</p>
      </section>
      <section>
        <h2>Hosting, abuse prevention and logs</h2>
        <p>The Cloudflare deployment applies abuse limits using a SHA-256 digest of the source IP address. Neither the source IP nor that digest is written to the Statusline D1 database.</p>
        <p>Persistent Worker invocation logs are disabled. Cloudflare may still process IP addresses and request metadata at its edge for delivery, security, abuse prevention, aggregate metrics and billing. Statusline contains no advertising SDK and no first-party product analytics SDK.</p>
      </section>
      <section>
        <h2>Retention and deletion</h2>
        <p>Pairing links expire after ten minutes. Channels expire after thirty days without a successful publication, and a daily task removes expired rows. Rate-limit state is scoped to 60-second windows and is not stored in the relay database.</p>
        <p>Disconnecting the desktop attempts to delete the remote channel and removes its local credential. Disconnecting the mobile reader removes its local credential and encryption key.</p>
        <p>See <a href="/delete-data">Delete Statusline data</a> for step-by-step instructions and the complete retention details.</p>
      </section>
      <section>
        <h2>Questions</h2>
        <p>Email <a href="mailto:founder@inmerzion.io">founder@inmerzion.io</a> or use the <a href="/support">Statusline support page</a> for privacy questions or reports. Never include pairing links, QR codes, API keys, access tokens or private Codex configuration.</p>
      </section>
    `,
  },
  "/support": {
    title: "Support",
    eyebrow: "STL / SUPPORT",
    summary: "Setup, pairing and diagnostics",
    content: `
      <section>
        <h2>Request support</h2>
        <p>Email <a href="mailto:founder@inmerzion.io">founder@inmerzion.io</a> for reproducible bugs, installation problems and privacy questions. Remove account identifiers, pairing links, QR codes, API keys, access tokens and private paths before submitting anything.</p>
      </section>
      <section>
        <h2>Codex CLI not found</h2>
        <p>Install or update the official Codex CLI, open a new terminal and run <code>codex --version</code>. Complete Sign in with ChatGPT the first time Codex opens, then use Connections → Codex Source → Scan again in Statusline Companion.</p>
        <p>If automatic detection fails, choose Select executable. Statusline validates the selected launcher with <code>codex --version</code> before saving it.</p>
      </section>
      <section>
        <h2>Phone does not receive a sample</h2>
        <ol>
          <li>Confirm Universal Relay shows a public HTTPS endpoint.</li>
          <li>Create a new pairing and scan it within ten minutes.</li>
          <li>Confirm the desktop changes from Pairing to Connected.</li>
          <li>Refresh while Codex is authenticated, then refresh the phone.</li>
          <li>Verify desktop and mobile builds use the same relay origin.</li>
        </ol>
      </section>
      <section>
        <h2>Useful diagnostic details</h2>
        <ul>
          <li>Operating system and Statusline version.</li>
          <li>Installer format and output of <code>codex --version</code>.</li>
          <li>Codex Source origin, version and state.</li>
          <li>Relay hostname and state, never the full pairing URL.</li>
        </ul>
      </section>
      <section>
        <h2>Delete your data</h2>
        <p>Statusline has no user account. Follow the steps on the <a href="/delete-data">Statusline data deletion page</a> to remove local credentials and encrypted relay data, or email support for a deletion request.</p>
      </section>
    `,
  },
  "/delete-data": {
    title: "Delete Statusline Data",
    eyebrow: "STL / DATA CONTROL",
    summary: "Remove local credentials and encrypted relay data",
    content: `
      <section>
        <h2>No Statusline account</h2>
        <p>Statusline does not create a user account and does not receive your Codex credentials, email address, prompts, source code or conversation history. A paired device stores only local relay credentials, an encryption key and the latest decrypted quota snapshot.</p>
      </section>
      <section>
        <h2>Delete data from Android</h2>
        <ol>
          <li>Open Statusline and scroll to <strong>Relay Control</strong>.</li>
          <li>Select <strong>Disconnect</strong> and confirm.</li>
          <li>Statusline removes the reader credential, encryption key and cached quota snapshot from the device. You can also clear the local demo with <strong>Clear Demo</strong>.</li>
        </ol>
        <p>Uninstalling Statusline removes its normal local application data according to Android's application-storage behavior.</p>
      </section>
      <section>
        <h2>Delete the encrypted relay channel</h2>
        <ol>
          <li>Open Statusline Companion on the paired Windows, Linux or macOS computer.</li>
          <li>Open <strong>Universal Relay</strong> and select <strong>Disconnect</strong>.</li>
          <li>The Companion attempts to delete the remote channel immediately, then removes its local publisher credential.</li>
        </ol>
        <p>If the publisher is unavailable, stop using the channel. Pairing links expire after ten minutes and channels are automatically deleted after thirty days without a successful publication.</p>
      </section>
      <section>
        <h2>Request deletion or assistance</h2>
        <p>Email <a href="mailto:founder@inmerzion.io">founder@inmerzion.io</a> with the subject <strong>Statusline data deletion</strong>. State which device or relay channel you can no longer disconnect, but never send a pairing link, QR code, API key, access token, encryption key or Codex authentication file.</p>
        <p>Statusline support can explain local removal and retention. Because the relay stores only random identifiers, hashed random credentials and opaque ciphertext, support cannot identify a channel from your name or email and cannot decrypt its contents. Inactive channel data is retained for no longer than thirty days after its last successful publication.</p>
      </section>
    `,
  },
};

export function publicPageResponse(
  pathname: string,
  method: string,
): Response | null {
  const page = pages[pathname];
  if (page === undefined) {
    return null;
  }
  if (method !== "GET" && method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: publicHeaders({ Allow: "GET, HEAD" }),
    });
  }
  return new Response(method === "HEAD" ? null : renderPage(page), {
    status: 200,
    headers: publicHeaders({ "Content-Type": "text/html; charset=utf-8" }),
  });
}

function publicHeaders(additional: Record<string, string>): Headers {
  return new Headers({
    "Cache-Control": "public, max-age=300",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    ...additional,
  });
}

function renderPage(page: PublicPage): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="description" content="${page.summary}">
  <title>${page.title} — Statusline</title>
  <style>
    :root { color-scheme: dark; --canvas:#0d0e0b; --surface:#14150f; --ink:#ece9dc; --muted:#9d9b89; --line:#3b3929; --signal:#efc65a; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; color:var(--ink); background-color:var(--canvas); background-image:linear-gradient(rgba(239,198,90,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(239,198,90,.045) 1px,transparent 1px); background-size:24px 24px; font:16px/1.65 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    main { width:min(760px,calc(100% - 32px)); margin:0 auto; padding:48px 0 64px; }
    header,section,.action { border:1px solid var(--line); background:rgba(20,21,15,.96); }
    header { padding:28px; margin-bottom:16px; }
    section { padding:24px; margin-top:12px; }
    .eyebrow,.action span,footer { color:var(--signal); font:700 12px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace; letter-spacing:.12em; }
    h1 { margin:12px 0 4px; font-size:clamp(34px,7vw,58px); line-height:1; letter-spacing:-.04em; }
    h2 { margin:0 0 12px; font-size:20px; }
    p,li { color:var(--muted); }
    p:last-child { margin-bottom:0; }
    a { color:var(--signal); text-underline-offset:3px; }
    code { color:var(--ink); background:var(--canvas); padding:.16em .36em; }
    .action-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; margin-top:12px; }
    .action { display:flex; flex-direction:column; gap:8px; padding:20px; text-decoration:none; }
    .action strong { color:var(--ink); }
    footer { display:flex; justify-content:space-between; gap:12px; margin-top:24px; color:var(--muted); }
    @media (max-width:520px) { main{padding-top:20px} header,section{padding:20px} footer{flex-direction:column} }
  </style>
</head>
<body>
  <main>
    <header><div class="eyebrow">${page.eyebrow}</div><h1>${page.title}</h1><p>${page.summary}</p></header>
    ${page.content}
    <footer><span>STATUSLINE / DATA PLANE</span><span>INDEPENDENT · NOT ENDORSED BY OPENAI</span></footer>
  </main>
</body>
</html>`;
}
