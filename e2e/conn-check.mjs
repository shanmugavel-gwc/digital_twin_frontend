import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`${process.env.UI_URL}/#connectors`); await p.waitForSelector(".conn", { timeout: 30000 }); await p.waitForTimeout(800);
console.log("cards:", await p.$$eval(".conn h3", (e) => e.map((x) => x.textContent)));
console.log("tiles:", await p.$$eval(".tile", (e) => e.map((x) => x.querySelector(".tile-label").textContent + "=" + x.querySelector(".tile-value").textContent)));
await p.screenshot({ path: process.env.OUT + "/conn.png", fullPage: true });
console.log("errors:", errs.length ? errs : "none"); await b.close();
