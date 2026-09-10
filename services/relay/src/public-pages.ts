import {
  englishPages as pages,
  publicPageMatch,
  publicPagePath,
  publicSiteOrigin,
} from "../../../content/public-pages";
import type { PublicPage } from "../../../content/public-pages";

export function publicPageResponse(
  pathname: string,
  method: string,
): Response | null {
  const destination = publicPageMatch(pathname);
  // Only information routes redirect; /v1 and /health never do.
  const page = pathname === "/" ? pages["/"] : undefined;
  if (page === undefined && destination === null) {
    return null;
  }
  if (method !== "GET" && method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: publicHeaders({ Allow: "GET, HEAD" }),
    });
  }
  if (destination) {
    return new Response(null, {
      status: 301,
      // Never forward query strings, request hosts or credentials.
      headers: publicHeaders({
        Location: `${publicSiteOrigin}${publicPagePath(destination.id, destination.language)}`,
      }),
    });
  }
  return new Response(method === "HEAD" ? null : renderPage(page!), {
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
