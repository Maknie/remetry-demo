/**
 * SDK wiring — exactly what an outside consumer writes.
 *
 * The package is installed as a normal npm dependency (`@remetry/browser`,
 * here resolved from the vendored tarball) and configured from `.env`
 * (VITE_* prefix — see .env.example). This module centralises the resolved
 * config so the status bar can display it and pages can read it.
 */
import {
  init,
  flush,
  shutdown,
  getSessionId,
  errorsPlugin,
  performancePlugin,
  apiPlugin,
  replayPlugin,
} from "@remetry/browser";

const env = import.meta.env;

export interface RemetryConfig {
  dsn: string;
  endpoint: string;
  release: string;
  replayMode: "onError" | "always";
  dashboardUrl: string;
  mockApiBase: string;
}

export const remetryConfig: RemetryConfig = {
  dsn: env.VITE_REMETRY_DSN ?? "demo-public-dsn",
  endpoint: env.VITE_REMETRY_ENDPOINT ?? "http://localhost:8080/ingest/events",
  release: env.VITE_REMETRY_RELEASE ?? "demo@1.0.0",
  replayMode: (env.VITE_REMETRY_REPLAY_MODE as "onError" | "always") ?? "onError",
  dashboardUrl: env.VITE_DASHBOARD_URL ?? "http://localhost:5173",
  mockApiBase: env.VITE_MOCK_API_BASE ?? "http://localhost:5174/__mock",
};

/**
 * Initialise (or re-initialise) the SDK. All four plugins are installed so
 * every capture surface is live from the first page load: errors +
 * performance, api (fetch/XHR patch), and replay (rrweb, loaded lazily).
 */
export function initRemetry(sessionId?: string): void {
  init({
    dsn: remetryConfig.dsn,
    endpoint: remetryConfig.endpoint,
    release: remetryConfig.release,
    sessionId,
    integrations: [
      errorsPlugin(),
      performancePlugin(),
      apiPlugin(),
      replayPlugin({ mode: remetryConfig.replayMode }),
    ],
  });
}

let pagehideBound = false;

/** Deliver the tail of events on unload — required for web-vitals and replay. */
export function bindPagehideFlush(): void {
  if (pagehideBound) return;
  pagehideBound = true;
  window.addEventListener("pagehide", () => flush(true));
}

/**
 * Reset the session: shut the current client down and re-init with a fresh
 * session id, so consecutive runs are separable in Replays/Issues.
 * Returns the new session id.
 */
export function resetSession(): string {
  shutdown();
  initRemetry(); // SDK generates a new session id
  return getSessionId();
}

/** Mask the middle of the DSN for display; reveal is a status-bar toggle. */
export function maskDsn(dsn: string): string {
  if (dsn.length <= 6) return "••••";
  return `${dsn.slice(0, 3)}${"•".repeat(dsn.length - 6)}${dsn.slice(-3)}`;
}
