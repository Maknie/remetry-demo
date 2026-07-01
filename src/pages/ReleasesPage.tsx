/**
 * Release regression.
 *
 * The `release` is set once at init (VITE_REMETRY_RELEASE) and the SDK tags
 * every event with it. Regression is a *two-run* story: send a healthy batch
 * under one release, then — after restarting the demo with the next release
 * tag — send a regressed batch, and the dashboard's Releases view flags the
 * delta.
 *
 * A single browser session only ever carries one release tag, so each batch
 * fans out across synthetic sessionIds/userIds to clear the server-side noise
 * floors. The two batch buttons are deterministic by severity (healthy vs
 * regressed); the env drives *which release* the data lands on.
 */
import { captureEvent } from "@remetry/browser";
import { remetryConfig } from "../remetry";
import { CaseCard } from "../components/CaseCard";
import { ExpectedResult } from "../components/ExpectedResult";
import { useEventLog } from "../eventLog";

const SESSIONS = 20;

interface Profile {
  errorRate: number;
  lcpBase: number;
}

const PROFILES: Record<"healthy" | "regressed", Profile> = {
  healthy: { errorRate: 0.05, lcpBase: 1400 },
  regressed: { errorRate: 0.4, lcpBase: 3400 },
};

export function ReleasesPage() {
  const { record } = useEventLog();

  /**
   * Emit one release's worth of events across SESSIONS synthetic sessions: one
   * LCP sample each, plus an error for an `errorRate` fraction. The SDK stamps
   * the active release on every event.
   */
  const runBatch = (id: string, severity: "healthy" | "regressed") => {
    const { errorRate, lcpBase } = PROFILES[severity];
    const run = Date.now().toString(36);
    let errs = 0;
    for (let i = 0; i < SESSIONS; i++) {
      const sessionId = `demo-${severity}-${run}-s${i}`;
      const userId = `u-${severity}-${run}-${i}`;
      captureEvent({
        type: "performance",
        timestamp: new Date().toISOString(),
        sessionId,
        userId,
        performance: { metric: "LCP", value: lcpBase + (i % 10) * 30 },
      });
      if (i < Math.round(SESSIONS * errorRate)) {
        errs++;
        captureEvent({
          type: "error",
          timestamp: new Date().toISOString(),
          sessionId,
          userId,
          error: {
            name: "TypeError",
            message: "release regression demo boom",
            stack: "TypeError: release regression demo boom\n    at Checkout (app.min.js:1:2345)",
          },
        });
      }
    }
    record(id, "perf", `${severity} batch · ${SESSIONS} LCP @ ${lcpBase}ms`, SESSIONS);
    if (errs > 0) record(id, "error", `${severity} batch · ${errs} errors`, errs);
  };

  const openDashboardReleases = () => {
    record("rel-compare", "perf", "open dashboard → Releases");
    window.open(`${remetryConfig.dashboardUrl}/releases`, "_blank", "noopener");
  };

  return (
    <>
      <h1>Releases</h1>
      <p className="page-intro">
        Each batch fans events across {SESSIONS} synthetic sessions tagged with the
        active <code>release</code>. Run the baseline, restart the demo with the
        next release tag, run the regressed batch, then compare in the dashboard's
        Releases view.
      </p>

      <div className="note">
        <strong>Active release:</strong> <code>{remetryConfig.release}</code>.
        <br />
        Two-run workflow: (1) keep <code>demo@1.0.0</code> and click <em>Run baseline</em>;
        (2) restart with <code>VITE_REMETRY_RELEASE=demo@1.1.0</code> and click{" "}
        <em>Run regressed</em>; (3) open the comparison. Server-side flagging needs
        volume across both releases — run each batch a couple of times if the delta
        doesn't show.
      </div>

      <CaseCard
        id="rel-run-baseline"
        title="Run baseline batch"
        description="A healthy batch (≈5% error rate, good LCP). Run this under the baseline release (demo@1.0.0)."
        snippet={`${SESSIONS} sessions · ~5% errors · LCP ~1.4s · release=${remetryConfig.release}`}
        expected={
          <ExpectedResult dashboard="Releases">
            Baseline metrics recorded against the active release.
          </ExpectedResult>
        }
      >
        <button type="button" data-testid="rel-run-baseline" onClick={() => runBatch("rel-run-baseline", "healthy")}>
          Run baseline batch
        </button>
      </CaseCard>

      <CaseCard
        id="rel-run-regressed"
        title="Run regressed batch"
        description="A degraded batch (≈40% error rate, LCP ~3.4s). Restart with release=demo@1.1.0 first so it lands on a different release bucket."
        snippet={`${SESSIONS} sessions · ~40% errors · LCP ~3.4s · release=${remetryConfig.release}`}
        expected={
          <ExpectedResult dashboard="Releases">
            Noticeably higher error rate + worse LCP on the new release → regression flagged.
          </ExpectedResult>
        }
      >
        <button type="button" data-testid="rel-run-regressed" className="danger" onClick={() => runBatch("rel-run-regressed", "regressed")}>
          Run regressed batch
        </button>
      </CaseCard>

      <CaseCard
        id="rel-compare"
        title="Compare releases"
        description="Open the dashboard's Releases view to see the delta between the two release tags and the regression flag."
        snippet={`open("${remetryConfig.dashboardUrl}/releases")`}
        expected={
          <ExpectedResult dashboard="Releases">
            The 1.0.0 → 1.1.0 delta and a regression flag are visible.
          </ExpectedResult>
        }
      >
        <button type="button" data-testid="rel-compare" onClick={openDashboardReleases}>
          Open Releases ↗
        </button>
      </CaseCard>

      <CaseCard
        id="rel-clean-noop"
        title="Clean re-run (no false positive)"
        description="A healthy batch run under the new release (demo@1.1.0) — confirms a clean release is NOT flagged as a regression."
        snippet={`${SESSIONS} sessions · ~5% errors · LCP ~1.4s · release=${remetryConfig.release}`}
        expected={
          <ExpectedResult dashboard="Releases">
            No regression flagged for the new release (false-positive guard).
          </ExpectedResult>
        }
      >
        <button type="button" data-testid="rel-clean-noop" onClick={() => runBatch("rel-clean-noop", "healthy")}>
          Run clean batch
        </button>
      </CaseCard>
    </>
  );
}
