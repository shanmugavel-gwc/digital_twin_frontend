// UI verification only. Uses FIXTURE responses (obviously synthetic, never shipped in the app) so every page can be
// rendered without the backend. Checks: Montserrat loaded, theme toggle + persistence + no flash, screenshots of all
// 7 pages in light and dark, and a text-contrast audit of every visible text node.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(import.meta.dirname, "../../screenshots");
fs.mkdirSync(OUT, { recursive: true });
const PORT = 4173, BASE = `http://localhost:${PORT}`;

const meta = { state_type: "SIMULATED", model_version: "TWIN-2.0", validation_status: "NEEDS_REVIEW", assumptions: ["FIXTURE: buffers 20 units (A-04)", "FIXTURE: units-per-cycle factor calibrated per line"] };
const areas = [["SMT", ["PCB Laser Marking", "Solder Paste Printing", "SPI Inspection", "Pick and Place", "Reflow Soldering", "AOI Inspection", "X-Ray Inspection", "PCBA Functional Test"]]];
const stations = areas.flatMap(([a, names]) => names.map((n, i) => ({ station_id: `ST-${a}-0${i + 1}0`, station_name: n, process_area: a, cycle_sec: 8 + i, machines: i === 3 ? [{ machine_id: "M-SMT-01", machine_name: "Yamaha YSM20R" }] : [], buffer_after_units: 20 })));
const util = [41, 55, 63, 96, 78, 70, 52, 47];
const fx = {
  "/kpis": { ...meta, calibration_verdict: "NEEDS_REVIEW", kpis: { prediction_error_pct: 9.4, throughput_improvement_pct: 6.2, bottleneck_reduction_pct: 11.8, scenario_turnaround_ms: 4200, data_freshness_hours: 262 }, data_freshness: [{ source: "MES:fact_hourly_production", max_ts: "2026-10-31 23:00", age_hours: 262 }] },
  "/twin/model": { ...meta, plants: [{ plant_id: "IN-TN-01", lines: [{ line_id: "SMT-L1", stations }] }, { plant_id: "IN-KA-01", lines: [{ line_id: "SMT-L2", stations }] }] },
  "/twin/bottleneck": { ...meta, stations: stations.map((s, i) => ({ station_id: s.station_id, utilization_pct: util[i], avg_queue_units: 3.2, blocked_pct: 4, starved_pct: 9, is_bottleneck: i === 3 })) },
  "/twin/live-state": { state_type: "LIVE", model_version: "TWIN-2.0", validation_status: "NEEDS_REVIEW", assumptions: [], stations: [] },
  "/scenarios/history": { ...meta, items: [{ scenario_id: "TWIN-0001", scenario_name: "Cycle time improvement", line_id: "FAL-L2", plant_id_as_stored: "IN-TN-01", plant_matches_line: false, predicted_output_units: 7352, actual_output_comparison_units: 9526, stored_error_pct: 10.57, recomputed_error_pct: 22.82, error_gap_pts: 12.25 }] },
  "/scenarios?status=PENDING_REVIEW": { ...meta, items: [{ run_id: "fixture-run-1", scenario_name: "Buffer increase", line_id: "SMT-L1", model_version: "TWIN-2.0", validation_status: "NEEDS_REVIEW", confidence_score: 71, predicted_output_units: 7600, bottleneck_station_id: "ST-SMT-040", assumptions: ["FIXTURE assumption"] }] },
  "/scenarios": { ...meta, items: [{ run_id: "a", scenario_name: "Baseline", line_id: "SMT-L1", status: "SIMULATED", predicted_output_units: 7400, predicted_wip_units: 52.1, predicted_utilization_pct: 88, confidence_score: 74, model_version: "TWIN-2.0" }, { run_id: "b", scenario_name: "Buffer increase", line_id: "SMT-L1", status: "PENDING_REVIEW", predicted_output_units: 7600, predicted_wip_units: 61.4, predicted_utilization_pct: 90, confidence_score: 71, model_version: "TWIN-2.0" }] },
  "/audit?limit=100": { items: [{ id: 1, ts: "2026-11-11T10:00:00Z", actor: "ui", action: "SCENARIO_RUN", entity: "scenario", entity_id: "fixture-run-1", details: { fixture: true } }] },
  "/calibration/report": { ...meta, thresholds: { validated_max: 8, needs_review_max: 15 }, split: { train_start: "2026-08-01", train_end: "2026-09-30", holdout_start: "2026-10-01", holdout_end: "2026-10-31" },
    lines: ["SMT-L1", "FAL-L1"].map((l, k) => ({ line_id: l, verdict: k ? "VALIDATED" : "NEEDS_REVIEW", parallelism_factor: 1.42, train: { mape_pct: 6.1, bias_pct: -1.2, rmse: 22, n_hours: 1464 }, holdout: { mape_pct: k ? 7.2 : 10.4, bias_pct: 2.1, rmse: 25.5, n_hours: 744 },
      daily: Array.from({ length: 31 }, (_, d) => ({ date: `2026-10-${String(d + 1).padStart(2, "0")}`, actual: 7700 + ((d * 37) % 300), simulated: 7600 + ((d * 53) % 280) })) })) },
  "/conversations": { items: [{ id: "c1", title: "Bottleneck on SMT-L1" }] },
  "/conversations/c1": { messages: [{ role: "user", content: "What is the bottleneck on SMT-L1?" }, { role: "assistant", content: "FIXTURE answer: Pick and Place is the bottleneck.\nModel: TWIN-2.0 | State: SIMULATED | Confidence: 71/100 | Validation: NEEDS_REVIEW | Key assumptions: buffers 20 units", steps: [{ tool: "get_bottleneck_map", input: { line_id: "SMT-L1" }, output: { bottleneck: "ST-SMT-040" } }] }] },
};
const run = { run_id: "r1", scenario_name: "Buffer increase", line_id: "SMT-L1", status: "SIMULATED", state_type: "SIMULATED", ...meta, turnaround_ms: 4100, predicted_output_units: 7600, predicted_wip_units: 61.4, predicted_utilization_pct: 90, bottleneck_station_id: "ST-SMT-040",
  confidence: { score: 71, band_low: 7350, band_high: 7850, components: { calibration_mape: 10.4, interval_width: 0.07, extrapolation_penalty: 0, data_freshness_penalty: 12 } },
  baseline_delta: { output_units: 200, throughput_improvement_pct: 2.7, wip_units: 9.3, utilization_pct: 2, bottleneck_shift: "none" } };

const preview = spawn(process.execPath, [path.resolve(import.meta.dirname, "../node_modules/vite/bin/vite.js"), "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
const results = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" }); // OS dark: app must still default to light
  await ctx.route("**/api/**", (route) => {
    const u = new URL(route.request().url());
    const key = u.pathname.replace(/^\/api/, "") + (u.search.startsWith("?status") || u.search.startsWith("?limit") ? u.search : "");
    if (route.request().method() === "POST" && key === "/scenarios/run") return route.fulfill({ json: run });
    if (route.request().method() === "POST" && key === "/scenarios/compare") return route.fulfill({ json: { ...meta, runs: [{ ...run, run_id: "a", scenario_name: "Baseline", predicted_output_units: 7400, confidence_score: 74 }, { ...run, confidence_score: 71 }] } });
    const body = fx[key];
    return body ? route.fulfill({ json: body }) : route.fulfill({ status: 404, json: { detail: `no fixture for ${key}` } });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#overview`);
  await page.waitForSelector(".tile");
  results.push(["default theme is light despite OS dark", (await page.evaluate(() => document.documentElement.dataset.theme)) === undefined]);
  await page.evaluate(() => document.fonts.ready);
  const fontOk = await page.evaluate(() => document.fonts.check('600 14px "Montserrat"') && getComputedStyle(document.body).fontFamily.includes("Montserrat"));
  results.push(["Montserrat loaded (document.fonts.check + computed family)", fontOk]);

  const pages = ["overview", "twin", "lab", "compare", "calibration", "review", "chat"];
  const contrastFails = {};
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") {
      await page.click(".theme-toggle");
      results.push(["toggle sets data-theme=dark", (await page.evaluate(() => document.documentElement.dataset.theme)) === "dark"]);
      await page.reload();
      results.push(["dark persists across reload", (await page.evaluate(() => document.documentElement.dataset.theme)) === "dark"]);
    }
    for (const p of pages) {
      await page.goto(`${BASE}/#${p}`);
      await page.waitForTimeout(300);
      if (p === "twin") { await page.waitForSelector(".station"); await page.click(".station.bottleneck"); }
      if (p === "lab") { await page.waitForSelector("select"); await page.click("button.primary"); await page.waitForSelector(".tile"); }
      if (p === "compare") { await page.waitForSelector("input[type=checkbox]"); const cb = await page.$$("input[type=checkbox]"); for (const c of cb) await c.check(); await page.click("button.primary"); await page.waitForSelector("text=Side by side"); }
      if (p === "calibration") await page.waitForSelector(".chart svg");
      if (p === "chat") { await page.click(".chat-layout .conv >> nth=1"); await page.waitForSelector(".bubble.bot"); }
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${p}-${theme}.png`), fullPage: false });
      await page.mouse.move(0, 0); // audit resting state; hover colours are specified by the theme guide and checked separately
      // contrast audit
      const fails = await page.evaluate(() => {
        const parse = (c) => c.match(/[\d.]+/g).map(Number);
        const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const bgOf = (el) => { let cur = el; let acc = [0, 0, 0, 0]; const stack = []; while (cur) { const c = parse(getComputedStyle(cur).backgroundColor); if (c[3] === undefined) c[3] = 1; stack.push(c); if (c[3] === 1) break; cur = cur.parentElement; }
          let base = stack.pop().slice(0, 3); while (stack.length) { const c = stack.pop(); base = base.map((v, i) => c[i] * c[3] + v * (1 - c[3])); } return base; };
        const out = [];
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const seen = new Set();
        while (w.nextNode()) {
          const n = w.currentNode; if (!n.textContent.trim()) continue;
          const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
          const cs = getComputedStyle(el); if (el.closest("button:disabled")) continue; if (cs.visibility === "hidden" || cs.display === "none" || el.offsetParent === null && cs.position !== "fixed") continue;
          const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
          const fg = parse(cs.color); const bg = bgOf(el);
          const a = fg[3] ?? 1; const fgc = fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
          const L1 = lum(fgc), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
          const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
          if (ratio < need) out.push(`${el.tagName.toLowerCase()}.${el.className?.toString().split(" ")[0] ?? ""} "${n.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)}<${need}`);
        }
        return out;
      });
      if (fails.length) contrastFails[`${p}-${theme}`] = fails;
      // clipped text check
      const clipped = await page.evaluate(() => [...document.querySelectorAll(".tile-value,.badge,.station-name,button,.page-header h2")].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== "visible").map((e) => e.className + ":" + e.textContent.slice(0, 20)));
      if (clipped.length) contrastFails[`${p}-${theme}-clipped`] = clipped;
    }
  }
  results.push(["WCAG AA text contrast on all pages, both themes", Object.keys(contrastFails).length === 0]);
  fs.writeFileSync(path.join(OUT, "contrast-report.json"), JSON.stringify(contrastFails, null, 2));
  // no-flash check: with dark saved, the attribute is set before the app script runs
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => { localStorage.setItem("theme", "dark"); });
  await p2.route("**/src/main.jsx", (r) => r.abort()); await p2.route("**/assets/*.js", (r) => r.abort());
  await p2.goto(`${BASE}/#overview`);
  results.push(["dark applied by inline script before app JS (no flash)", (await p2.evaluate(() => document.documentElement.dataset.theme)) === "dark"]);
} finally {
  await browser.close();
  preview.kill();
}
let bad = 0;
for (const [n, ok] of results) { console.log(`${ok ? "PASS" : "FAIL"}  ${n}`); if (!ok) bad++; }
console.log(`screenshots: ${OUT}`);
process.exit(bad ? 1 : 0);
