import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// The X-API-Key is injected by the dev proxy (server side), so it never ships in the browser bundle.
function apiKey() {
  if (process.env.API_KEY) return process.env.API_KEY;
  try {
    const env = fs.readFileSync(path.resolve(__dirname, "../backend/.env"), "utf8");
    const m = env.match(/^API_KEY=(.*)$/m);
    return m ? m[1].trim() : "";
  } catch { return ""; }
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.API_TARGET || "http://localhost:8000",
        changeOrigin: true,
        headers: apiKey() ? { "X-API-Key": apiKey() } : {},
      },
    },
  },
});
