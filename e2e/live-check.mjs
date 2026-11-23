// Real stack check: UI on :5173 -> proxy -> FastAPI -> Neon (+ real Domo model for chat). No fixtures.
// Start first:  backend: python -m uvicorn app.main:app --port 8000   ui: npm run dev
import { chromium } from "playwright";
const pages = ["overview", "twin", "lab", "compare", "calibration", "review", "chat"];
const BASE = process.env.UI_URL || "http://localhost:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let calls = [];
page.on("response", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) calls.push(`${r.request().method()} ${u.pathname}${u.search} -> ${r.status()}`); });
const jsErrors = [];
page.on("pageerror", (e) => jsErrors.push(e.message));
const settle = async () => { await page.waitForTimeout(400); await page.waitForFunction(() => !document.querySelector(".typing"), null, { timeout: 90000 }); await page.waitForTimeout(500); };
let failures = 0;
const report = async (label, expectNoErrors = true) => {
  const errs = await page.$$eval(".error-box", (els) => els.map((e) => e.textContent.trim().slice(0, 120)));
  const n = async (s) => (await page.$$(s)).length;
  console.log(`\n== ${label}: tiles=${await n(".tile")} table_rows=${await n("table.data tbody tr")} stations=${await n(".station")} charts=${await n(".chart svg")} error_boxes=${errs.length}`);
  [...new Set(calls)].forEach((c) => { console.log("   ", c); if (/-> (4|5)\d\d/.test(c)) failures++; });
  errs.forEach((e) => { console.log("    UI ERROR:", e); if (expectNoErrors) failures++; });
  calls = [];
};
await page.goto(`${BASE}/#overview`);
for (const p of pages) {
  calls = [];
  await page.evaluate((h) => { location.hash = h; }, p);
  await settle();
  await report(p);
  if (p === "overview") console.log("   KPI tiles:", await page.$$eval(".tile", (e) => e.map((x) => x.querySelector(".tile-label").textContent + "=" + x.querySelector(".tile-value").textContent)));
  if (p === "twin") {
    await page.selectOption("select", "SMT-L1"); await settle(); await page.waitForSelector(".bn-label", { timeout: 60000 }).catch(() => {}); await report("twin (SMT-L1, SIMULATED)");
    console.log("   bottleneck labels:", await page.$$eval(".bn-label", (e) => e.length), " util bars:", await page.$$eval(".ubar", (e) => e.length));
    await page.click("button:has-text('LIVE')"); await settle(); await report("twin (LIVE toggle)");
    await page.click("button:has-text('SIMULATED')"); await settle();
    await page.click("button:has-text('Compute')"); await page.waitForSelector("th:has-text(\"Gain %\")", { timeout: 120000 }); await report("twin (what to fix first)");
  }
  if (p === "lab") {
    await page.selectOption("select >> nth=0", "SMT-L1");
    // an SMT-only scenario on a FAL line must be rejected with a clear message (422)
    await page.selectOption("select >> nth=0", "FAL-L1"); await page.selectOption("select >> nth=1", "SMT machine outage");
    await page.click("button.primary:has-text('Run simulation')"); await page.waitForSelector(".error-box", { timeout: 30000 });
    console.log("   FAL outage rejected:", (await page.$eval(".error-box", (e) => e.textContent)).trim().slice(0, 90)); calls = [];
    await page.selectOption("select >> nth=0", "SMT-L1");
    for (const sc of ["Buffer increase", "SMT machine outage"]) {
      await page.selectOption("select >> nth=1", sc);
      await page.click("button.primary:has-text('Run simulation')");
      await page.waitForSelector(".tile", { timeout: 120000 }); await page.waitForTimeout(600);
      await report(`lab (${sc} run)`);
      console.log("   result tiles:", await page.$$eval(".tile", (e) => e.map((x) => x.querySelector(".tile-label").textContent + "=" + x.querySelector(".tile-value").textContent)));
    }
    await page.click("button:has-text('Submit for engineering review')"); await page.waitForTimeout(2500); await report("lab (submitted for review)");
  }
  if (p === "review") {
    console.log("   pending cards:", await page.$$eval(".card h3", (e) => e.map((x) => x.textContent).filter((t) => / on /.test(t))));
  }
  if (p === "chat") {
    await page.fill(".composer input", "Run a Buffer increase scenario with buffer_factor 2 on SMT-L1 and tell me the effect, confidence and validation status.");
    await page.click(".composer button"); await page.waitForSelector(".bubble.bot", { timeout: 180000 }); await settle(); await report("chat (real Domo model)");
    console.log("   answer:", (await page.$eval(".bubble.bot", (e) => e.firstChild.textContent)).slice(0, 700));
    console.log("   trace tools:", await page.$$eval(".steps summary", (e) => e.map((x) => x.textContent)));
  }
}
console.log("\nJS runtime errors:", jsErrors.length ? jsErrors : "none");
console.log(failures ? `\nFAILURES: ${failures}` : "\nALL PAGES OK");
await browser.close();
process.exit(failures ? 1 : 0);
