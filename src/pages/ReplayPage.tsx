/**
 * Session-replay surfaces of replayPlugin().
 *
 * Replay isn't a one-shot event: rrweb records continuously (or, in the default
 * "onError" mode, keeps a rolling ~30s buffer and uploads it once the first
 * error is captured). So most cases are "do some activity, then crash" — the
 * crash flushes the buffer and links the replay to the resulting issue.
 *
 * Interact with the scratch area / privacy form first, THEN trigger a case, so
 * the recording has something to show. Verify in dashboard → Replays.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CaseCard } from "../components/CaseCard";
import { TriggerButton } from "../components/TriggerButton";
import { ExpectedResult } from "../components/ExpectedResult";
import { remetryConfig } from "../remetry";
import { useEventLog } from "../eventLog";

export function ReplayPage() {
  const navigate = useNavigate();
  const { record } = useEventLog();
  const [clicks, setClicks] = useState(0);
  const [text, setText] = useState("");
  const mode = remetryConfig.replayMode;

  /** onError: a little activity then a crash so the rolling buffer flushes. */
  const triggerOnError = () => {
    setClicks((c) => c + 1);
    window.setTimeout(() => {
      throw new Error("REPLAY-01 crash after activity (onError flush)");
    }, 0);
  };

  /** always-mode: just generate activity (no error needed to have a replay). */
  const triggerAlways = () => {
    setClicks((c) => c + 1);
  };

  /** privacy: crash so the buffer (with the form interactions) is uploaded. */
  const triggerPrivacyCrash = () => {
    window.setTimeout(() => {
      throw new Error("REPLAY-03 crash to flush privacy form recording");
    }, 0);
  };

  /** multipage: hop across routes, then crash — the replay should span them. */
  const triggerMultipage = () => {
    record("replay-multipage", "replay", "navigate /errors → /api → /replay then crash");
    navigate("/errors");
    window.setTimeout(() => navigate("/api"), 400);
    window.setTimeout(() => navigate("/replay"), 800);
    window.setTimeout(() => {
      throw new Error("REPLAY-04 crash after multi-route navigation");
    }, 1200);
  };

  return (
    <>
      <h1>Session Replay</h1>
      <p className="page-intro">
        rrweb records the session; in the default <code>onError</code> mode nothing
        uploads until the first error, then the buffered ~30s (and everything after)
        is sent and linked to the issue. Play in the scratch area and privacy form
        below, then trigger a case. Check Replays in your dashboard.
      </p>

      <div className="note">
        <strong>Current replay mode:</strong> <code>{mode}</code> (set via{" "}
        <code>VITE_REMETRY_REPLAY_MODE</code>). Cases that need a different mode
        require a restart with the matching env — each card says so. The privacy
        defaults (<code>maskAllInputs</code>, <code>data-remetry-mask</code>,{" "}
        <code>data-remetry-block</code>) are always on.
      </div>

      {/* Scratch area + privacy form — interact here before triggering a crash. */}
      <div className="case-card">
        <h3>
          <span className="case-id">replay-scratch</span>Scratch area &amp; privacy form
        </h3>
        <p className="desc">
          Activity here is what shows up in the player. The privacy form demonstrates
          the three masking behaviours.
        </p>
        <div className="case-controls">
          <button type="button" data-testid="replay-activity" onClick={() => setClicks((c) => c + 1)}>
            Click me (<span className="replay-counter">{clicks}</span>)
          </button>
        </div>
        <div className="replay-form">
          <label>
            Normal input — masked by <code>maskAllInputs</code>
            <input
              data-testid="replay-input-normal"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="type something — it's masked in the replay"
            />
          </label>
          <div data-remetry-mask data-testid="replay-mask-text">
            <span className="mask-label">
              Text under <code>data-remetry-mask</code>:
            </span>{" "}
            <strong>Account balance: $12,345.67</strong> — blanked in the player.
          </div>
          <div className="replay-secret" data-remetry-block data-testid="replay-block">
            Secret block (<code>data-remetry-block</code>) — this node is not recorded
            at all.
          </div>
        </div>
      </div>

      <CaseCard
        id="replay-onerror"
        title="onError — buffer flushes on first error"
        description="A click then a crash. In onError mode the rolling buffer (your actions before the error) uploads and links to the issue."
        snippet={`// interact, then:\nsetTimeout(() => { throw new Error("crash") }, 0)`}
        expected={
          <ExpectedResult dashboard="Replays">
            A replay tied to the new issue; the player shows actions <em>before</em> the crash.
          </ExpectedResult>
        }
      >
        <TriggerButton id="replay-onerror" label="Act then crash" type="replay" note="onError buffer flush" danger onTrigger={triggerOnError} />
      </CaseCard>

      <CaseCard
        id="replay-always"
        title="always — record from session start"
        description="With VITE_REMETRY_REPLAY_MODE=always a replay exists even with no error. Restart the demo with that env, then click to generate activity."
        snippet={`replayPlugin({ mode: "always" })  // via VITE_REMETRY_REPLAY_MODE`}
        expected={
          <ExpectedResult dashboard="Replays">
            {mode === "always" ? (
              <>Replay present without any error (continuous from session start).</>
            ) : (
              <>Needs <code>VITE_REMETRY_REPLAY_MODE=always</code> + restart (current: <code>{mode}</code>).</>
            )}
          </ExpectedResult>
        }
      >
        <TriggerButton id="replay-always" label="Generate activity" type="replay" note="always-mode activity" onTrigger={triggerAlways} />
      </CaseCard>

      <CaseCard
        id="replay-privacy"
        title="Privacy masking"
        description="Type in the form above, then crash to upload. Inspect the player to confirm masking."
        snippet={`maskAllInputs:true · [data-remetry-mask] text blanked · [data-remetry-block] omitted`}
        expected={
          <ExpectedResult dashboard="Replays">
            In the player: the normal input is masked, the <code>data-remetry-mask</code> text is
            blanked, and the <code>data-remetry-block</code> node is absent.
          </ExpectedResult>
        }
      >
        <TriggerButton id="replay-privacy" label="Crash to upload" type="replay" note="privacy form flush" danger onTrigger={triggerPrivacyCrash} />
      </CaseCard>

      <CaseCard
        id="replay-multipage"
        title="Multi-page coverage"
        description="Navigates /errors → /api → back to /replay, then crashes — the replay should span all the route changes."
        snippet={`navigate("/errors"); …; navigate("/replay"); throw`}
        expected={
          <ExpectedResult dashboard="Replays">
            One replay covering the navigation up to the crash.
          </ExpectedResult>
        }
      >
        <button type="button" data-testid="replay-multipage" className="danger" onClick={triggerMultipage}>
          Hop routes then crash
        </button>
      </CaseCard>

      <CaseCard
        id="replay-sample-zero"
        title="sampleRate: 0 — no recording"
        description="A config scenario, not a click: with sampleRate 0 the session is never sampled, rrweb never loads, and nothing is recorded."
        snippet={`replayPlugin({ sampleRate: 0 })  // config option`}
        expected={
          <ExpectedResult dashboard="Replays">
            <strong>No</strong> replay is created for the session (negative check).
          </ExpectedResult>
        }
      >
        <span className="status-pill muted" data-testid="replay-sample-zero">config scenario — no trigger</span>
      </CaseCard>
    </>
  );
}
