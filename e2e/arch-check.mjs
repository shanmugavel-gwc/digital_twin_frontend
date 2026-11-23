// Architecture page check: screenshots of each stage, opens a system's details, reports elements that overflow their box.
import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1875, height: 1000 } });
await ctx.addInitScript(() => localStorage.setItem("dt-user", "e2e-admin"));
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:5173/#architecture"); await p.waitForSelector(".ar-card", { timeout: 90000 });
const overflow = () => p.evaluate(() => [...document.querySelectorAll(".ar-panel *")].filter((e) => {
  const r = e.getBoundingClientRect(), pr = e.parentElement.getBoundingClientRect();
  return r.width > 0 && (r.right > pr.right + 2 || r.left < pr.left - 2) && getComputedStyle(e.parentElement).overflowX === "visible";
}).slice(0, 5).map((e) => `${e.tagName}.${e.className} "${(e.textContent || "").slice(0, 30)}"`));
await p.locator(".ar-card", { hasText: "Workforce" }).getByRole("button", { name: /View details/ }).click(); await p.waitForTimeout(500);
console.log("systems + Workforce details overflow:", JSON.stringify(await overflow()));
await p.locator(".ar-panel").screenshot({ path: `${process.env.OUT}/arch-systems.png` });
for (const n of ["database", "preparation", "agent", "outputs", "decision"]) {
  await p.locator(".ar-stage").nth(["systems", "database", "preparation", "agent", "outputs", "decision"].indexOf(n)).click(); await p.waitForTimeout(400);
  console.log(n, "overflow:", JSON.stringify(await overflow()));
  await p.locator(".ar-panel").screenshot({ path: `${process.env.OUT}/arch-${n}.png` });
}
console.log("errors:", errs.length ? errs : "none"); await b.close();
