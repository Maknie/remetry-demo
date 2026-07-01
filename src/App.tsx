/**
 * App frame: status bar, left nav, the routed page, and the right-rail trigger
 * log. A global <ErrorBoundary> (from the SDK's React entry) wraps the routed
 * content so a page-level render crash is reported and contained rather than
 * blanking the app — again, the exact pattern a real consumer uses.
 */
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "@remetry/browser/react";
import { EventLogProvider } from "./eventLog";
import { StatusBar } from "./components/StatusBar";
import { EventLog } from "./components/EventLog";
import { OverviewPage } from "./pages/OverviewPage";
import { ErrorsPage } from "./pages/ErrorsPage";
import { ApiPage } from "./pages/ApiPage";
import { PerformancePage } from "./pages/PerformancePage";
import { ReplayPage } from "./pages/ReplayPage";
import { ReleasesPage } from "./pages/ReleasesPage";
import { LimitsPage } from "./pages/LimitsPage";

const NAV: Array<{ to: string; label: string; hint: string }> = [
  { to: "/", label: "Overview", hint: "start here" },
  { to: "/errors", label: "Errors", hint: "capture surfaces" },
  { to: "/api", label: "API / Network", hint: "fetch + XHR" },
  { to: "/performance", label: "Performance", hint: "web vitals" },
  { to: "/replay", label: "Session Replay", hint: "rrweb" },
  { to: "/releases", label: "Releases", hint: "regression" },
  { to: "/limits", label: "Tenancy & Limits", hint: "server probes" },
];

export function App() {
  return (
    <EventLogProvider>
      <div className="app">
        <StatusBar />
        <div className="body">
          <nav className="sidebar" aria-label="Demo pages">
            <div className="brand">
              Remetry
              <small>SDK demo</small>
            </div>
            {NAV.map(({ to, label, hint }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              >
                {label}
                <span className="hint">{hint}</span>
              </NavLink>
            ))}
            <div className="sidebar-note">
              This app deliberately generates errors, failed requests, and
              degraded metrics so you can watch Remetry capture them.
            </div>
          </nav>

          <main className="content">
            <ErrorBoundary
              fallback={
                <div className="fallback">
                  This page crashed during render — reported to Remetry.
                  Navigate away and back to retry.
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<OverviewPage />} />
                <Route path="/errors" element={<ErrorsPage />} />
                <Route path="/api" element={<ApiPage />} />
                <Route path="/performance" element={<PerformancePage />} />
                <Route path="/replay" element={<ReplayPage />} />
                <Route path="/releases" element={<ReleasesPage />} />
                <Route path="/limits" element={<LimitsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ErrorBoundary>
          </main>

          <aside className="eventlog" aria-label="Trigger log">
            <EventLog />
          </aside>
        </div>
      </div>
    </EventLogProvider>
  );
}
