// Fails if a hex colour literal appears in any .jsx/.css/.js(x) source file other than src/theme.css.
// Also flags rgb()/hsl() literals with numeric channels (use tokens or the *-rgb tokens instead).
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../src");
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const bad = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|css)$/.test(e.name) && e.name !== "theme.css") scan(p);
  }
}
function scan(file) {
  fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    for (const m of code.matchAll(HEX)) bad.push(`${path.relative(root, file)}:${i + 1}  ${m[0]}`);
    if (/\b(rgba?|hsla?)\(\s*\d/.test(code)) bad.push(`${path.relative(root, file)}:${i + 1}  numeric colour function`);
  });
}
walk(root);
if (bad.length) {
  console.error("lint:theme FAILED. Use var(--token) instead of literal colours:\n" + bad.join("\n"));
  process.exit(1);
}
console.log("lint:theme OK (no literal colours outside theme.css)");
