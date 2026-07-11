import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mockApiPlugin } from "./mock/server";

// Standalone Remetry demo (lives outside the `remetry/` repo). Unlike the in-repo
// example, this app installs the SDK the way an outside consumer would — from the
// vendored tarball in `vendor/` (see package.json), not `workspace:*`.
//
// The API/network page talks to a tiny in-process mock server mounted at `/__mock`
// (controlled statuses / delays / CORS) — see mock/server.ts. `host: true` binds
// every interface so the cross-origin CORS case can hit the 127.0.0.1 alias of
// the same dev server.
export default defineConfig({
  plugins: [react(), mockApiPlugin()],
  build: {
    // "hidden": emit .map files for the Remetry symbolication upload (CI) but
    // don't append sourceMappingURL comments — the maps never ship to Pages
    // (deploy.yml deletes them from dist after upload), so a comment would
    // only produce 404 noise in visitors' devtools.
    sourcemap: "hidden",
  },
  server: {
    host: true,
    port: 5174, // standalone demo port (dashboard runs on 5173)
  },
});
