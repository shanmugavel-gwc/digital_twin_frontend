import { useCallback, useEffect, useState } from "react";

// All calls go to /api (proxied to the FastAPI backend). No secrets live in the browser:
// the dev proxy adds X-API-Key server side.
export class ApiError extends Error {
  constructor(message, status, body) { super(message); this.status = status; this.body = body; }
}

export async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    const headers = {};
    if (body) headers["Content-Type"] = "application/json";
    const u = currentUserId();
    if (u) headers["X-User"] = u;
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Backend API is not reachable (is it running on :8000?).", 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) {
    const detail = data?.detail ?? data?.error ?? res.statusText;
    throw new ApiError(typeof detail === "string" ? detail : JSON.stringify(detail), res.status, data);
  }
  return data;
}

// useApi(path): { data, error, loading, reload }. Pass null to skip.
export function useApi(path) {
  const [state, set] = useState({ data: null, error: null, loading: !!path });
  const load = useCallback(() => {
    if (!path) { set({ data: null, error: null, loading: false }); return; }
    set((s) => ({ ...s, loading: true, error: null }));
    api(path).then((data) => set({ data, error: null, loading: false }),
                   (error) => set({ data: null, error, loading: false }));
  }, [path]);
  useEffect(load, [load]);
  return { ...state, reload: load };
}

export const fmt = (v, d = 0) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "n/a" : Number(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }));
export const pct = (v, d = 1) => (v === null || v === undefined ? "n/a" : `${fmt(v, d)}%`);

// ---------------------------------------------------------------- selected user (identity selection, NOT authentication; see Users page)
const USER_KEY = "dt-user";
export function currentUserId() { try { return localStorage.getItem(USER_KEY) || ""; } catch { return ""; } }
export function setCurrentUserId(id) {
  try { if (id) localStorage.setItem(USER_KEY, id); else localStorage.removeItem(USER_KEY); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event("dt-user"));
}
export function useCurrentUser() {
  const [state, set] = useState({ user: null, loading: true });
  const load = useCallback(() => {
    if (!currentUserId()) { set({ user: null, loading: false }); return; }
    api("/me").then((d) => set({ user: d.user, loading: false }), () => set({ user: null, loading: false }));
  }, []);
  useEffect(() => { load(); window.addEventListener("dt-user", load); return () => window.removeEventListener("dt-user", load); }, [load]);
  return state;
}
export const ROLE_RANK = { VIEWER: 0, ENGINEER: 1, PLANNER: 2, ADMIN: 3 };
export const can = (user, role) => !!user && ROLE_RANK[user.role] >= ROLE_RANK[role];

// ---------------------------------------------------------------- hash routing with params: #page?key=value
export function parseHash() {
  const h = location.hash.slice(1);
  const [page, qs] = h.split("?");
  return { page: page || "home", params: Object.fromEntries(new URLSearchParams(qs || "")) };
}
export function go(page, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();
  location.hash = `${page}${qs ? `?${qs}` : ""}`;
}
export function useRoute() {
  const [r, set] = useState(parseHash());
  useEffect(() => { const on = () => set(parseHash()); window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  return r;
}
export const dt = (v) => (v ? new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "n/a");
