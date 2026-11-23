// Production server for the UI (Render web service). Node built-ins only, no dependencies.
//  - serves the built app from ./dist (run `npm run build` first)
//  - proxies /api/* to the backend and adds X-API-Key SERVER SIDE, exactly like the Vite dev proxy, so the key never
//    reaches the browser (CLAUDE.md: secrets never in the frontend). Streams responses, so Server-Sent Events work.
// Environment: PORT (Render sets it), API_TARGET (backend base URL, default https://digital-twin-backend-8tsc.onrender.com), API_KEY,
//              FRAME_ANCESTORS (origins allowed to embed the app in an iframe; default 'self').
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const PORT = Number(process.env.PORT || 4173);
const DEFAULT_API = "https://digital-twin-backend-8tsc.onrender.com";
const TARGET = new URL(process.env.API_TARGET || DEFAULT_API);
const API_KEY = process.env.API_KEY || "";
const client = TARGET.protocol === "https:" ? https : http;

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("FATAL: dist/index.html not found. Run `npm run build` before `node server.mjs`.");
  process.exit(1);
}
if (!process.env.API_TARGET) console.log(`API_TARGET not set; using the hosted backend ${DEFAULT_API}.`);
if (!API_KEY) console.warn("WARNING: API_KEY is not set; the backend will reject /api calls if its key guard is on.");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".map": "application/json",
};
// Who may embed the app in an <iframe>: CSP frame-ancestors (X-Frame-Options is not sent: it cannot list another origin).
// FRAME_ANCESTORS = space/comma separated origins, e.g. "https://portal.example.com https://*.example.com".
// Allowed tokens: 'self', 'none', https://host[:port] (wildcard sub-domain ok), http://localhost[:port] / http://127.0.0.1[:port].
// Unset -> 'self' (only this app's own origin may frame it).
function frameAncestors(raw) {
  const ok = /^(?:'self'|'none'|https:\/\/(?:\*\.)?[a-z0-9.-]+(?::\d+)?|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)$/i;
  const tokens = String(raw || "").split(/[\s,]+/).filter(Boolean)
    .map((t) => (t === "self" || t === "none" ? `'${t}'` : t.replace(/\/+$/, "")));
  const good = tokens.filter((t) => ok.test(t));
  const bad = tokens.filter((t) => !ok.test(t));
  if (bad.length) console.warn(`WARNING: FRAME_ANCESTORS ignored invalid entries: ${bad.join(" ")}`);
  if (good.includes("'none'")) return "'none'";
  return good.length ? good.join(" ") : "'self'";
}
const FRAME_ANCESTORS = frameAncestors(process.env.FRAME_ANCESTORS);
const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Content-Security-Policy": `frame-ancestors ${FRAME_ANCESTORS}`,
};
// hop-by-hop headers are not forwarded; the browser's own key header (if any) is replaced by the server's
const DROP = new Set(["host", "connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "x-api-key"]);

function proxy(req, res) {
  const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !DROP.has(k.toLowerCase())));
  if (API_KEY) headers["x-api-key"] = API_KEY;
  headers["x-forwarded-proto"] = req.headers["x-forwarded-proto"] || "https";
  const basePath = TARGET.pathname.replace(/\/$/, "");
  const up = client.request({
    protocol: TARGET.protocol, hostname: TARGET.hostname, port: TARGET.port || (TARGET.protocol === "https:" ? 443 : 80),
    method: req.method, path: basePath + req.url, headers, timeout: 300000,
  }, (r) => {
    const out = { ...r.headers };
    delete out.connection;
    if (String(r.headers["content-type"] || "").startsWith("text/event-stream")) out["cache-control"] = "no-cache";
    res.writeHead(r.statusCode || 502, out);
    if (res.flushHeaders) res.flushHeaders();
    r.pipe(res);
  });
  up.on("timeout", () => up.destroy(new Error("upstream timeout")));
  up.on("error", (e) => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "bad_gateway", detail: `Backend API not reachable (${e.code || e.message}).` }));
  });
  // stop the upstream call only if the BROWSER went away before the response finished (e.g. an SSE tab closed).
  // (The request's own "close" fires as soon as its body is read, so it must not be used for this.)
  res.on("close", () => { if (!res.writableFinished) up.destroy(); });
  req.pipe(up);
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.normalize(path.join(DIST, urlPath));
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }            // no path traversal
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");   // SPA fallback (hash routing)
  const ext = path.extname(file).toLowerCase();
  const cache = file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache";
  res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": cache, ...SECURITY });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  if (req.url === "/healthz") { res.writeHead(200, { "Content-Type": "text/plain" }); res.end("ok"); return; }
  if (req.url.startsWith("/api/") || req.url === "/api") return proxy(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
  return serveStatic(req, res);
}).listen(PORT, () => console.log(`UI on :${PORT}, proxying /api to ${TARGET.origin}${TARGET.pathname === "/" ? "" : TARGET.pathname} (API key ${API_KEY ? "set" : "NOT set"}; frame-ancestors ${FRAME_ANCESTORS})`));
