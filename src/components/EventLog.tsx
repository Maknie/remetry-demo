/**
 * Right-rail feed of recent triggers (newest first). Lets you line up what you
 * clicked against records that appear in the dashboard.
 */
import { useEventLog } from "../eventLog";

function time(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

export function EventLog() {
  const { entries } = useEventLog();

  return (
    <div>
      <h2>Trigger log</h2>
      {entries.length === 0 ? (
        <p className="log-empty">Nothing yet — click a case trigger.</p>
      ) : (
        entries.map((e, i) => (
          <div className="log-entry" key={`${e.ts}-${i}`}>
            <span className="ts">{time(e.ts)}</span>{" "}
            <span className="cid">{e.caseId}</span>
            <span className={`pill ${e.type}`}>{e.type}</span>
            <div>{e.note}</div>
          </div>
        ))
      )}
    </div>
  );
}
