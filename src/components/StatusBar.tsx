/**
 * Persistent header shown on every page. Surfaces the live session id, the
 * resolved SDK config, local trigger counters, and the global actions
 * (flush / open dashboard / reset session).
 */
import { useState } from "react";
import { flush, getSessionId } from "@remetry/browser";
import { remetryConfig, resetSession, maskDsn } from "../remetry";
import { useEventLog, type RemetryEventType } from "../eventLog";

const COUNTER_LABELS: Array<{ type: RemetryEventType; label: string }> = [
  { type: "error", label: "errors" },
  { type: "api", label: "api" },
  { type: "perf", label: "perf" },
  { type: "replay", label: "replay" },
];

export function StatusBar() {
  const { counters, reset } = useEventLog();
  const [sessionId, setSessionId] = useState(() => getSessionId());
  const [revealDsn, setRevealDsn] = useState(false);
  const [copied, setCopied] = useState(false);

  const copySession = async () => {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard may be unavailable (insecure context) — ignore */
    }
  };

  const onReset = () => {
    const next = resetSession();
    setSessionId(next);
    reset();
  };

  return (
    <div className="status-bar">
      <div className="sb-field">
        <span className="k">Session</span>
        <span className="v">
          <code>{sessionId.slice(0, 8)}…</code>
          <button className="mini" type="button" data-testid="sb-copy-session" onClick={copySession}>
            {copied ? "copied" : "copy"}
          </button>
        </span>
      </div>

      <div className="sb-field">
        <span className="k">Release</span>
        <span className="v">{remetryConfig.release}</span>
      </div>

      <div className="sb-field sb-endpoint">
        <span className="k">Endpoint</span>
        <span className="v">{remetryConfig.endpoint}</span>
      </div>

      <div className="sb-field">
        <span className="k">DSN</span>
        <span className="v">
          <code>{revealDsn ? remetryConfig.dsn : maskDsn(remetryConfig.dsn)}</code>
          <button className="mini" type="button" onClick={() => setRevealDsn((r) => !r)}>
            {revealDsn ? "hide" : "reveal"}
          </button>
        </span>
      </div>

      <div className="sb-field">
        <span className="k">Replay</span>
        <span className="v">{remetryConfig.replayMode}</span>
      </div>

      <div className="sb-spacer" />

      <div className="sb-counters">
        {COUNTER_LABELS.map(({ type, label }) => (
          <div className="counter" key={type}>
            <span className="n">{counters[type]}</span>
            <span className="t">{label}</span>
          </div>
        ))}
      </div>

      <div className="sb-actions">
        <button type="button" data-testid="sb-flush" onClick={() => flush()}>
          Flush now
        </button>
        <a
          className="btn-link"
          href={remetryConfig.dashboardUrl}
          target="_blank"
          rel="noreferrer"
          data-testid="sb-open-dashboard"
        >
          Open dashboard ↗
        </a>
        <button type="button" data-testid="sb-reset-session" onClick={onReset}>
          Reset session
        </button>
      </div>
    </div>
  );
}
