// Home page check: screenshots (light + dark) and clicking each pipeline stage. OUT=<dir> node e2e/home-check.mjs
import { chromium } from "playwright";
const b = await chromium.launch();
for (const t of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1040 } });
  await ctx.addInitScript((th) => { localStorage.setItem("dt-user", "e2e-admin"); localStorage.setItem("theme", th); }, t);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:5173/"); await p.waitForSelector(".hm-stage", { timeout: 60000 }); await p.waitForTimeout(800);
  await p.screenshot({ path: `${process.env.OUT}/home-${t}.png` });
  if (t === "light") {
    for (const n of [1, 3, 4]) { await p.locator(`.hm-s${n}`).click(); await p.waitForTimeout(300); console.log("stage", n, "->", (await p.textContent(".hm-detail h2")).trim()); }
    await p.locator(".hm-s5").click(); await p.locator(".hm-flow li button").nth(2).click(); await p.waitForTimeout(300);
    console.log("expanded:", (await p.textContent(".hm-simple")).slice(0, 80));
    await p.screenshot({ path: `${process.env.OUT}/home-${t}-detail.png`, fullPage: false });
  }
  console.log(t, "errors:", errs.length ? errs : "none"); await ctx.close();
}
await b.close();
