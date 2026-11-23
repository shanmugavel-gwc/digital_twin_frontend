// Screenshots of the platform pages (real backend). Usage: OUT=<dir> node e2e/platform-check.mjs [page ...]
import { chromium } from "playwright";
const BASE = process.env.UI_URL || "http://localhost:5173";
const pages = process.argv.slice(2).length ? process.argv.slice(2) : ["overview", "architecture", "agent", "reports", "integrations", "settings", "users", "audit"];
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
const THEME = process.env.THEME || "light";
await ctx.addInitScript((t) => { localStorage.setItem("dt-user", "e2e-admin"); localStorage.setItem("theme", t); }, THEME);
const p = await ctx.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 200)));
for (const pg of pages) {
  await p.goto(`${BASE}/#${pg}`); await p.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(pg.startsWith("twin") ? 9000 : 2500);
  const file = `${process.env.OUT}/${THEME}-${pg.replace(/[?=]/g, "_")}.png`;
  if (pg.startsWith("twin")) { const c = await p.$(".f3d-canvas"); await c.scrollIntoViewIfNeeded(); await p.waitForTimeout(1500); await c.screenshot({ path: file }); }
  else await p.screenshot({ path: file, fullPage: true });
  console.log(pg, "ok");
}
console.log("errors:", errs.length ? errs : "none"); await b.close();
