/**
 * Web Vitals + navigation-timing surfaces of performancePlugin().
 *
 * The plugin reports FCP/DCL/Load as soon as they're known, but LCP/CLS/INP are
 * only final when the page goes away — so the page leads with a **Finalize &
 * flush** control that dispatches a synthetic `pagehide`. That fires the
 * plugin's one-shot finalize (LCP/CLS/INP → beacon flush) without actually
 * navigating away. Because finalize runs once per session, start a fresh run
 * with "Reset session" in the status bar between measurements.
 *
 * - bad-lcp / cls insert into a measurement stage (a hero image becomes the
 *   largest contentful paint; an unsized banner shifts the content below it).
 * - inp blocks the main thread inside the click handler (worst interaction).
 * - slow-load / fcp can only be degraded at page load, so they reload with a
 *   query flag that the top of main.tsx busy-waits on (see slowLoad.ts).
 */
import { useEffect, useRef } from "react";
import { flush } from "@remetry/browser";
import { CaseCard } from "../components/CaseCard";
import { TriggerButton } from "../components/TriggerButton";
import { ExpectedResult } from "../components/ExpectedResult";
import { useEventLog } from "../eventLog";

// A large image that, inserted late, becomes the Largest Contentful Paint.
const HERO_SVG =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='420'>` +
      `<rect width='1200' height='420' fill='#6366f1'/>` +
      `<text x='48' y='230' font-size='60' font-family='sans-serif' fill='#ffffff'>Late hero image — LCP candidate</text>` +
      `</svg>`,
  );

const BASELINE_HTML =
  '<div class="perf-content"><strong>Measurement stage.</strong> ' +
  "The LCP case appends a large hero image here; the CLS case inserts an " +
  "unsized banner above this text so it jumps down. This block is what shifts.</div>";

export function PerformancePage() {
  const { record } = useEventLog();
  const stageRef = useRef<HTMLDivElement>(null);

  // The stage is an uncontrolled container — React renders it empty and we
  // populate / mutate it by hand, so manual inserts never fight reconciliation.
  useEffect(() => {
    if (stageRef.current) stageRef.current.innerHTML = BASELINE_HTML;
  }, []);

  const resetStage = () => {
    if (stageRef.current) stageRef.current.innerHTML = BASELINE_HTML;
  };

  /** Dispatch a synthetic pagehide so the plugin finalizes LCP/CLS/INP, then flush. */
  const finalize = () => {
    record("perf-finalize", "perf", "finalize: pagehide → flush(true)");
    try {
      window.dispatchEvent(new Event("pagehide"));
    } catch {
      /* ignore */
    }
    flush(true);
  };

  /** After ~2.5s, append a large hero image → it becomes the LCP element. */
  const triggerBadLcp = () => {
    window.setTimeout(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const img = document.createElement("img");
      img.className = "perf-hero";
      img.alt = "late hero";
      img.src = HERO_SVG;
      stage.appendChild(img);
    }, 2500);
  };

  /** After ~1.5s, insert an unsized banner above the content → layout shift. */
  const triggerCls = () => {
    window.setTimeout(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const banner = document.createElement("div");
      banner.className = "perf-cls-banner";
      banner.textContent = "Late unsized banner — no height reserved, content jumps down.";
      stage.insertBefore(banner, stage.firstChild);
    }, 1500);
  };

  /** Block the main thread inside the click handler → long interaction (INP). */
  const triggerInp = () => {
    const end = performance.now() + 400;
    while (performance.now() < end) {
      /* deliberate busy-loop */
    }
  };

  /** Reload with a flag that busy-waits before paint/load (see slowLoad.ts). */
  const reloadWith = (id: string, query: string, note: string) => {
    record(id, "perf", note);
    window.location.href = `${window.location.pathname}?${query}`;
  };

  return (
    <>
      <h1>Performance / Web Vitals</h1>
      <p className="page-intro">
        Each case degrades a web-vital or navigation-timing metric. FCP/DCL/Load
        report on load; <code>LCP</code>, <code>CLS</code> and <code>INP</code> only
        finalize when the page goes away — so trigger a case, then click{" "}
        <strong>Finalize &amp; flush</strong> to send them. Check Performance in your
        dashboard (P75/P95 per page).
      </p>

      <div className="note">
        <strong>Note:</strong> finalize fires <em>once per session</em>. To measure
        another scenario, hit <code>Reset session</code> in the status bar first. All
        metrics are tagged with the active <code>release</code> — that's the bridge to
        release regression.
      </div>

      <CaseCard
        id="perf-finalize"
        title="Finalize &amp; flush (send LCP/CLS/INP)"
        description="Dispatches a synthetic pagehide so the performance plugin reports the page-lifetime vitals, then beacon-flushes."
        snippet={`window.dispatchEvent(new Event("pagehide")); flush(true)`}
        expected={
          <ExpectedResult dashboard="Performance">
            LCP/CLS/INP for this page are sent and appear in Web Vitals.
          </ExpectedResult>
        }
      >
        <button type="button" data-testid="perf-finalize" onClick={finalize}>
          Finalize &amp; flush
        </button>
      </CaseCard>

      <CaseCard
        id="perf-bad-lcp"
        title="Bad LCP — late hero image"
        description="A large image is inserted ~2.5s after load, becoming the largest contentful paint."
        snippet={`setTimeout(() => stage.append(largeImg), 2500)`}
        expected={
          <ExpectedResult dashboard="Performance">
            Degraded <code>LCP</code> on this page (then Finalize &amp; flush).
          </ExpectedResult>
        }
      >
        <TriggerButton id="perf-bad-lcp" label="Insert late hero" type="perf" note="bad LCP (late hero)" onTrigger={triggerBadLcp} />
      </CaseCard>

      <CaseCard
        id="perf-good-baseline"
        title="Good baseline — clean stage"
        description="Clears the stage so a finalize captures healthy LCP/CLS. Use this as the green control to compare against."
        snippet={`stage.innerHTML = baseline  // nothing degraded`}
        expected={
          <ExpectedResult dashboard="Performance">
            Healthy <code>LCP</code>/<code>CLS</code> — the reference run.
          </ExpectedResult>
        }
      >
        <TriggerButton id="perf-good-baseline" label="Reset to baseline" type="perf" note="good baseline" onTrigger={resetStage} />
      </CaseCard>

      <CaseCard
        id="perf-cls"
        title="Layout shift (CLS)"
        description="An unsized banner is inserted above the content ~1.5s in, pushing it down without reserved space."
        snippet={`setTimeout(() => stage.prepend(unsizedBanner), 1500)`}
        expected={
          <ExpectedResult dashboard="Performance">
            Elevated <code>CLS</code> (then Finalize &amp; flush).
          </ExpectedResult>
        }
      >
        <TriggerButton id="perf-cls" label="Shift the layout" type="perf" note="CLS (unsized banner)" onTrigger={triggerCls} />
      </CaseCard>

      <CaseCard
        id="perf-inp"
        title="Slow interaction (INP)"
        description="A click handler that busy-loops ~400ms — a long interaction the event-timing observer records."
        snippet={`onClick = () => { while (performance.now() < start + 400) {} }`}
        expected={
          <ExpectedResult dashboard="Performance">
            High <code>INP</code> (then Finalize &amp; flush).
          </ExpectedResult>
        }
      >
        <TriggerButton id="perf-inp" label="Block 400ms" type="perf" note="INP (400ms busy-loop)" danger onTrigger={triggerInp} />
      </CaseCard>

      <CaseCard
        id="perf-slow-load"
        title="Slow load (DCL / Load)"
        description="Reloads this page with ?perfSlow — the top of main.tsx busy-waits ~2.5s before paint, so the load event lands late."
        snippet={`location.href = "/performance?perfSlow=1"  // blocks before load`}
        expected={
          <ExpectedResult dashboard="Performance">
            Worse <code>DCL</code>/<code>Load</code> on the reloaded page (then Finalize &amp; flush).
          </ExpectedResult>
        }
      >
        <button
          type="button"
          data-testid="perf-slow-load"
          onClick={() => reloadWith("perf-slow-load", "perfSlow=1", "reload with ~2.5s pre-load block")}
        >
          Reload with slow load
        </button>
      </CaseCard>

      <CaseCard
        id="perf-fcp"
        title="Slow FCP — delayed first paint"
        description="Reloads with ?perfFcp — a shorter (~1.5s) pre-paint block delays First Contentful Paint."
        snippet={`location.href = "/performance?perfFcp=1"  // blocks before first paint`}
        expected={
          <ExpectedResult dashboard="Performance">
            Worse <code>FCP</code> on the reloaded page (then Finalize &amp; flush).
          </ExpectedResult>
        }
      >
        <button
          type="button"
          data-testid="perf-fcp"
          onClick={() => reloadWith("perf-fcp", "perfFcp=1", "reload with ~1.5s pre-paint block")}
        >
          Reload with slow FCP
        </button>
      </CaseCard>

      <div ref={stageRef} className="perf-stage" data-testid="perf-stage" />
    </>
  );
}
