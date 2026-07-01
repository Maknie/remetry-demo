/**
 * Landing page for an outside developer: what this demo is, how the SDK is
 * wired (the literal integration code), and where each capture surface lives.
 */
import { Link } from "react-router-dom";
import { remetryConfig } from "../remetry";

const INTEGRATION_SNIPPET = `// npm install @remetry/browser rrweb
import {
  init, flush,
  errorsPlugin, performancePlugin, apiPlugin, replayPlugin,
} from "@remetry/browser";

init({
  dsn: import.meta.env.VITE_REMETRY_DSN,
  endpoint: import.meta.env.VITE_REMETRY_ENDPOINT,
  release: import.meta.env.VITE_REMETRY_RELEASE,
  integrations: [
    errorsPlugin(),
    performancePlugin(),
    apiPlugin(),
    replayPlugin({ mode: "onError" }),
  ],
});

window.addEventListener("pagehide", () => flush(true));`;

const BOUNDARY_SNIPPET = `import { ErrorBoundary } from "@remetry/browser/react";

<ErrorBoundary fallback={<CrashScreen />}>
  <Routes>…</Routes>
</ErrorBoundary>`;

const PAGES: Array<{ to: string; title: string; blurb: string; where: string }> = [
  {
    to: "/errors",
    title: "Errors",
    blurb:
      "Every JS-error capture surface: uncaught throws, unhandled rejections, React render crashes, manual captureError(), grouping bursts.",
    where: "Issues",
  },
  {
    to: "/api",
    title: "API / Network",
    blurb:
      "fetch + XHR capture against a local mock API: 4xx/5xx, slow requests, CORS blocks, POST bodies, URL normalisation, self-transport filter.",
    where: "API monitoring",
  },
  {
    to: "/performance",
    title: "Performance",
    blurb:
      "Web vitals degraded on demand — late-hero LCP, layout-shift CLS, busy-loop INP, slow FCP/Load via pre-paint blocking reloads.",
    where: "Performance",
  },
  {
    to: "/replay",
    title: "Session Replay",
    blurb:
      "rrweb recording with onError buffering: act, crash, and the last ~30s upload and link to the issue. Privacy masking included.",
    where: "Replays",
  },
  {
    to: "/releases",
    title: "Releases",
    blurb:
      "Release-regression story: send a healthy batch under one release tag and a regressed one under the next, then compare.",
    where: "Releases",
  },
  {
    to: "/limits",
    title: "Tenancy & Limits",
    blurb:
      "Direct probes of the server's protection: bad DSN → 401, rate-limit floods → 429, tenant isolation → 403 on foreign projects.",
    where: "HTTP status codes (no dashboard needed)",
  },
];

export function OverviewPage() {
  return (
    <>
      <h1>Remetry SDK demo</h1>
      <p className="page-intro">
        This app installs <code>@remetry/browser</code> the way you would — as a
        normal npm dependency — and exercises every capture surface from real UI.
        Click triggers, watch the trigger log fill up, then open your dashboard to
        see what the SDK reported.
      </p>

      <div className="note">
        <strong>No backend?</strong> Everything here still runs — triggers fire, the
        SDK captures and batches, nothing crashes. To <em>see</em> the captured data,
        point <code>.env</code> at a running Remetry stack and open the dashboard
        (currently <code>{remetryConfig.dashboardUrl}</code>).
      </div>

      <section className="case-card">
        <h3><span className="case-id">setup</span>The entire integration</h3>
        <p className="desc">
          This is the complete wiring — everything else in the demo is just buttons.
          It runs in <code>src/main.tsx</code> before the app renders.
        </p>
        <pre>{INTEGRATION_SNIPPET}</pre>
      </section>

      <section className="case-card">
        <h3><span className="case-id">react</span>React error boundary</h3>
        <p className="desc">
          The React entry shares the same client instance, so boundary-caught render
          crashes land in the same session as everything else.
        </p>
        <pre>{BOUNDARY_SNIPPET}</pre>
      </section>

      <h2 className="section-heading">The six pages</h2>
      <div className="overview-grid">
        {PAGES.map((p) => (
          <Link key={p.to} to={p.to} className="overview-card">
            <h3>{p.title}</h3>
            <p>{p.blurb}</p>
            <span className="where-chip">→ {p.where}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
