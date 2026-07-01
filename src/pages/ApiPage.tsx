/**
 * Every network-capture surface of apiPlugin().
 *
 * Each case drives a fetch or XHR against the in-process mock API
 * (mock/server.ts, mounted at VITE_MOCK_API_BASE — self-contained, works
 * offline) with a controlled status / delay / CORS behaviour. The SDK's
 * fetch + XHR patch turns each call into a type:"api" event
 * (method/url/status/durationMs); the dashboard's API monitoring screen groups
 * them per endpoint with P95 + error rate.
 *
 * Two cases are about what should NOT happen: a cross-origin call with no CORS
 * headers surfaces as status 0, and a call to the SDK's own ingestion endpoint
 * is filtered out (never captured) so the transport doesn't observe itself.
 */
import type { ReactNode } from "react";
import { CaseCard } from "../components/CaseCard";
import { TriggerButton } from "../components/TriggerButton";
import { ExpectedResult } from "../components/ExpectedResult";
import { remetryConfig } from "../remetry";

const base = remetryConfig.mockApiBase;

/** Build a mock URL: `${VITE_MOCK_API_BASE}${path}`. */
function mock(path: string): string {
  return `${base}${path}`;
}

/**
 * A cross-origin variant of the mock base by swapping localhost ↔ 127.0.0.1
 * (different origins, same dev server thanks to `host: true`). Used by the CORS
 * case so the browser actually applies the cross-origin check against /no-cors.
 * Falls back to the plain base when the host is neither (then the case is a
 * same-origin no-op — see the case note).
 */
function crossOriginBase(): string {
  try {
    const u = new URL(base);
    if (u.hostname === "localhost") u.hostname = "127.0.0.1";
    else if (u.hostname === "127.0.0.1") u.hostname = "localhost";
    return u.toString().replace(/\/$/, "");
  } catch {
    return base;
  }
}

/** Fire a GET and ignore the outcome — the SDK patch captures it either way. */
async function get(url: string): Promise<void> {
  await fetch(url);
}

/** Issue an XHR GET (exercises the XHR patch, not just fetch). */
function xhrGet(url: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url);
      xhr.addEventListener("loadend", () => resolve());
      xhr.addEventListener("error", () => resolve());
      xhr.send();
    } catch {
      resolve();
    }
  });
}

interface ApiCase {
  id: string;
  title: string;
  description: string;
  snippet: string;
  note: string;
  count?: number;
  danger?: boolean;
  trigger: () => void | Promise<void>;
  expected: { text: ReactNode; dashboard?: string };
}

const CASES: ApiCase[] = [
  {
    id: "api-fetch-500",
    title: "fetch → 500",
    description: "A server error. The captured event carries the 5xx status and lifts the endpoint's error rate.",
    snippet: `fetch("{mock}/status/500")`,
    note: "fetch 500",
    trigger: () => get(mock("/status/500")),
    expected: {
      text: <>Endpoint shows a 5xx; <code>errorRate</code> climbs.</>,
      dashboard: "API monitoring",
    },
  },
  {
    id: "api-fetch-404",
    title: "fetch → 404",
    description: "A not-found response — a 4xx that should be recorded with status 404.",
    snippet: `fetch("{mock}/status/404")`,
    note: "fetch 404",
    trigger: () => get(mock("/status/404")),
    expected: { text: <>Recorded with <code>status=404</code>.</>, dashboard: "API monitoring" },
  },
  {
    id: "api-fetch-401-403",
    title: "fetch → 401 then 403",
    description: "Two auth-class responses in one click; both should be captured.",
    snippet: `fetch(".../status/401"); fetch(".../status/403")`,
    note: "fetch 401 + 403",
    count: 2,
    trigger: async () => {
      await Promise.all([get(mock("/status/401")), get(mock("/status/403"))]);
    },
    expected: { text: <>Two records with <code>status=401</code> and <code>403</code>.</>, dashboard: "API monitoring" },
  },
  {
    id: "api-network-error",
    title: "Network error (dead port)",
    description: "A connection that can't be made — the fetch rejects with no HTTP status.",
    snippet: `fetch("http://127.0.0.1:1/")  // refused`,
    note: "network error → status 0",
    danger: true,
    trigger: () => get("http://127.0.0.1:1/"),
    expected: { text: <>Recorded as a network error with <code>status=0</code>.</>, dashboard: "API monitoring" },
  },
  {
    id: "api-cors-blocked",
    title: "CORS-blocked (cross-origin, no headers)",
    description:
      "A cross-origin GET to an endpoint that sends no Access-Control-Allow-Origin. The browser blocks the read and the fetch rejects (opaque → status 0). Uses the 127.0.0.1↔localhost alias of this dev server to be genuinely cross-origin.",
    snippet: `fetch("http://127.0.0.1:5174/__mock/no-cors")  // cross-origin`,
    note: "CORS blocked → status 0",
    danger: true,
    trigger: () => get(`${crossOriginBase()}/no-cors`),
    expected: {
      text: <>Recorded as unreachable / <code>status=0</code> (browser-dependent).</>,
      dashboard: "API monitoring",
    },
  },
  {
    id: "api-slow",
    title: "Slow request (4s)",
    description: "A deliberately slow response so the endpoint's duration / P95 jumps.",
    snippet: `fetch("{mock}/delay/4000")`,
    note: "slow request (~4s)",
    trigger: () => get(mock("/delay/4000")),
    expected: {
      text: <>High <code>durationMs</code> → elevated P95 on the endpoint.</>,
      dashboard: "API monitoring",
    },
  },
  {
    id: "api-xhr-500",
    title: "XHR → 500",
    description: "Same 500, but over XMLHttpRequest — exercises the XHR patch, not fetch.",
    snippet: `const x = new XMLHttpRequest(); x.open("GET", ".../status/500"); x.send()`,
    note: "XHR 500",
    trigger: () => xhrGet(mock("/status/500")),
    expected: { text: <>Record from XHR with <code>method=GET</code>, <code>status=500</code>.</>, dashboard: "API monitoring" },
  },
  {
    id: "api-post-body",
    title: "POST with a body",
    description: "A POST to the echo route — the captured event should carry method=POST.",
    snippet: `fetch("{mock}/echo", { method: "POST", body })`,
    note: "POST body",
    trigger: async () => {
      await fetch(mock("/echo"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hello: "remetry", ts: Date.now() }),
      });
    },
    expected: { text: <>Recorded with <code>method=POST</code>.</>, dashboard: "API monitoring" },
  },
  {
    id: "api-url-normalize",
    title: "URL normalisation (two ids)",
    description:
      "Two different concrete URLs that should collapse server-side into one /users/:id/orders/:id template.",
    snippet: `fetch(".../users/123/orders/456"); fetch(".../users/789/orders/1")`,
    note: "url normalize (2 calls)",
    count: 2,
    trigger: async () => {
      await Promise.all([
        get(mock("/users/123/orders/456")),
        get(mock("/users/789/orders/1")),
      ]);
    },
    expected: {
      text: <>Both collapse into one endpoint <code>/users/:id/orders/:id</code> (server-side grouping).</>,
      dashboard: "API monitoring",
    },
  },
  {
    id: "api-parallel",
    title: "10 parallel requests",
    description: "A burst of ten concurrent calls — checks they all batch through and arrive.",
    snippet: `Promise.all(Array.from({ length: 10 }, () => fetch(".../ok")))`,
    note: "10 parallel (batching)",
    count: 10,
    trigger: async () => {
      await Promise.all(Array.from({ length: 10 }, () => get(mock("/ok"))));
    },
    expected: { text: <>All 10 arrive (confirms batching).</>, dashboard: "API monitoring" },
  },
  {
    id: "api-200-ok",
    title: "Successful request (200)",
    description: "A plain success — the dashboard should show healthy traffic, not only failures.",
    snippet: `fetch("{mock}/ok")`,
    note: "200 OK",
    trigger: () => get(mock("/ok")),
    expected: { text: <>Visible as a successful <code>status=200</code> call.</>, dashboard: "API monitoring" },
  },
  {
    id: "api-self-transport",
    title: "Self-transport is NOT captured",
    description:
      "A direct call to the SDK's own ingestion endpoint. apiPlugin filters its own transport, so this must produce no api event (otherwise the queue would never drain).",
    snippet: `fetch(VITE_REMETRY_ENDPOINT)  // the SDK's own endpoint`,
    note: "self-transport (expect NO event)",
    trigger: () => get(remetryConfig.endpoint),
    expected: {
      text: <><strong>No</strong> api record appears for the ingestion endpoint (confirms the self-filter).</>,
      dashboard: "API monitoring",
    },
  },
];

export function ApiPage() {
  return (
    <>
      <h1>API / Network</h1>
      <p className="page-intro">
        Each case drives a <code>fetch</code> or <code>XMLHttpRequest</code> against the
        built-in mock API (<code>{base}</code> — runs inside the dev server, works
        offline) so the SDK's network patch can capture it as an <code>api</code> event.
        After clicking, wait a few seconds and check API monitoring in your dashboard.
        The last two cases verify the <em>absence</em> of an event (CORS-blocked →{" "}
        <code>status 0</code>; self-transport → filtered out).
      </p>

      {CASES.map((c) => (
        <CaseCard
          key={c.id}
          id={c.id}
          title={c.title}
          description={c.description}
          snippet={c.snippet.replace(/\{mock\}/g, base)}
          expected={
            <ExpectedResult dashboard={c.expected.dashboard}>{c.expected.text}</ExpectedResult>
          }
        >
          <TriggerButton
            id={c.id}
            label="Trigger"
            type="api"
            note={c.note}
            count={c.count}
            danger={c.danger}
            onTrigger={c.trigger}
          />
        </CaseCard>
      ))}
    </>
  );
}
