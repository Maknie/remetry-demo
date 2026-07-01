# Remetry SDK demo

A standalone, multi-page showcase of the [`@remetry/browser`](https://www.npmjs.com/package/@remetry/browser)
SDK. It installs the SDK exactly the way you would in your own project — as a normal npm
dependency (here resolved from the vendored tarball in `vendor/`; once the package is on the
registry the dependency simply becomes `"@remetry/browser": "^1.0.0"`) — and exercises every
capture surface from real UI: errors, network calls, web vitals, session replay, release
regression, and the server's tenancy/limit protections.

## Quick start

```bash
npm install      # resolves @remetry/browser (vendored tarball) + deps
npm run dev      # http://localhost:5174
```

That's it. The app runs standalone: every trigger fires, the SDK captures and batches,
nothing crashes. To **see** the captured data you need a Remetry deployment — point the
config at your stack (below) and keep the dashboard open next to the demo.

Other scripts: `npm run build` (production build), `npm run preview` (serve the build; the
mock API is mounted there too), `npm run typecheck`.

## Configuration

Copy `.env.example` to `.env`:

| Variable | Default | Meaning |
|---|---|---|
| `VITE_REMETRY_DSN` | `demo-public-dsn` | Project DSN the SDK sends under |
| `VITE_REMETRY_ENDPOINT` | `http://localhost:8080/ingest/events` | Ingestion endpoint |
| `VITE_REMETRY_RELEASE` | `demo@1.0.0` | Release tag stamped on every event |
| `VITE_REMETRY_REPLAY_MODE` | `onError` | `onError` (buffer, upload on first error) or `always` |
| `VITE_DASHBOARD_URL` | `http://localhost:5173` | Link target for "Open dashboard" |
| `VITE_MOCK_API_BASE` | `http://localhost:5174/__mock` | Built-in mock API (leave as is) |

The defaults target a local Remetry stack with the seeded demo project.

## How the SDK is wired

The entire integration lives in `src/main.tsx` + `src/remetry.ts` and is the exact pattern
for a real app:

```ts
import { init, flush, errorsPlugin, performancePlugin, apiPlugin, replayPlugin } from "@remetry/browser";

init({
  dsn, endpoint, release,
  integrations: [errorsPlugin(), performancePlugin(), apiPlugin(), replayPlugin({ mode: "onError" })],
});
window.addEventListener("pagehide", () => flush(true));
```

plus the React entry (`@remetry/browser/react`) providing the global `<ErrorBoundary>` in
`src/App.tsx`. `rrweb` is a peer dependency — the replay plugin imports it lazily, so it
costs nothing until a replay actually starts.

## The pages

| Page | What it exercises | Where to look |
|---|---|---|
| **Overview** | The integration itself (literal code) | — |
| **Errors** | Uncaught throws, unhandled rejections, React render crashes, manual `captureError()`, non-Error throws, custom names, cause chains, grouping bursts | Issues |
| **API / Network** | fetch + XHR capture against the built-in mock API: 4xx/5xx, slow requests, network/CORS failures, POST bodies, URL normalisation, parallel batching, self-transport filter | API monitoring |
| **Performance** | Web vitals degraded on demand: late-hero LCP, layout-shift CLS, busy-loop INP, slow FCP/DCL/Load via pre-paint blocking reloads; "Finalize & flush" sends the page-lifetime vitals | Performance |
| **Session Replay** | rrweb recording with onError buffering, privacy masking (`maskAllInputs`, `data-remetry-mask`, `data-remetry-block`), multi-page coverage | Replays |
| **Releases** | Two-run regression story: healthy batch under one release tag, regressed batch under the next | Releases |
| **Tenancy & Limits** | Direct probes of server protections: invalid DSN → 401, rate-limit flood → 429, quota → 429, tenant isolation → 401/403/200 | HTTP statuses shown in-page |

Every case card shows its id, a snippet of what actually fires, the trigger, and what you
should see in Remetry. The right rail logs each click so you can correlate against the
dashboard. The status bar shows the live session id, config, and global actions
(flush / reset session / open dashboard).

## Notes

- **Mock API** (`mock/server.ts`) is mounted inside the Vite dev server at `/__mock` —
  no separate process, works offline. It exists to give the network cases controlled
  statuses, delays, and CORS behaviour.
- **CORS case** needs two origins; the dev server binds all interfaces (`host: true`), so
  the case uses the `localhost` ↔ `127.0.0.1` alias of the same server.
- **Tenancy & Limits** probes the ingestion service (`:8080`, wildcard CORS — works from the
  browser) and the product API (`:8081`, origin-restricted — start it with
  `DASHBOARD_ORIGIN` allowing `http://localhost:5174` for the sign-in probes).
- **Replay `always` mode** and alternative release tags need a restart with the matching
  env var — the relevant cards say so.
