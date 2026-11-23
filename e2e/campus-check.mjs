// Campus twin check: screenshots of the page and the canvas at a daytime and a night hour. OUT=<dir> node e2e/campus-check.mjs
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript((t) => { localStorage.setItem("dt-user", "e2e-admin"); localStorage.setItem("theme", t); }, process.env.THEME || "light");
const p = await ctx.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 160)));
await p.goto("http://localhost:5173/#twin");
await p.waitForSelector(".cp-stage canvas", { timeout: 60000 });
await p.waitForFunction(() => /\d{4}-\d\d-\d\d \d\d:\d\d/.test(document.querySelector(".cp-clock b")?.textContent || ""), null, { timeout: 60000 });
await p.getByRole("button", { name: /Pause/ }).click();
await p.locator(".cp-scrub").fill("13"); await p.waitForTimeout(5000);
await p.screenshot({ path: `${process.env.OUT}/campus-page.png`, fullPage: true });
await p.locator(".cp-stage").screenshot({ path: `${process.env.OUT}/campus-day.png` });
await p.locator(".cp-scrub").fill("21"); await p.waitForTimeout(3000);
await p.locator(".cp-stage").screenshot({ path: `${process.env.OUT}/campus-night.png` });
console.log("clock:", await p.textContent(".cp-clock b"), "| errors:", errs.length ? errs : "none");
await b.close();
