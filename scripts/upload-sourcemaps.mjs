// Upload dist/**/*.map to Remetry so the worker can symbolicate demo stacks.
// Mirrors the `remetry sourcemaps upload` CLI contract:
//   POST /releases   {dsn, version, commit}          (idempotent register)
//   POST /sourcemaps {dsn, release, artifact, map}   (map = base64 .map contents)
// The artifact name is the map's basename minus ".map" (index-XXX.js.map →
// index-XXX.js) — the worker matches it against stack-frame file basenames.
// Env: UPLOAD_TOKEN (required), INGEST_BASE, DSN, RELEASE, GITHUB_SHA.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const base = (process.env.INGEST_BASE ?? "https://ingest.remetry.dev").replace(/\/+$/, "");
const dsn = process.env.DSN ?? "demo-public-dsn";
const release = process.env.RELEASE ?? "demo@1.0.0";
const token = process.env.UPLOAD_TOKEN;
if (!token) {
  console.error("UPLOAD_TOKEN is required");
  process.exit(1);
}

const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

async function* maps(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* maps(p);
    else if (entry.name.endsWith(".map")) yield p;
  }
}

const relRes = await fetch(`${base}/releases`, {
  method: "POST",
  headers,
  body: JSON.stringify({ dsn, version: release, commit: process.env.GITHUB_SHA ?? "" }),
});
if (!relRes.ok) {
  console.error(`register release failed: HTTP ${relRes.status}`);
  process.exit(1);
}
console.log(`registered release ${release}`);

let uploaded = 0;
for await (const mapPath of maps("dist")) {
  const artifact = path.basename(mapPath).replace(/\.map$/, "");
  const map = (await readFile(mapPath)).toString("base64");
  const res = await fetch(`${base}/sourcemaps`, {
    method: "POST",
    headers,
    body: JSON.stringify({ dsn, release, artifact, map }),
  });
  if (!res.ok) {
    console.error(`upload ${artifact} failed: HTTP ${res.status}`);
    process.exit(1);
  }
  console.log(`uploaded source map for ${artifact}`);
  uploaded++;
}
if (uploaded === 0) {
  console.error("no .map files found in dist — is build.sourcemap enabled?");
  process.exit(1);
}
