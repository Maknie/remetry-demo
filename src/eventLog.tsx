/**
 * In-memory trigger log + per-type counters (React state only). This tracks
 * *what you clicked*, not data from the backend; the captured result is
 * verified in your Remetry dashboard. It exists to help correlate clicks here
 * with records that show up there.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type RemetryEventType = "error" | "api" | "perf" | "replay";

export interface LogEntry {
  ts: number;
  caseId: string;
  type: RemetryEventType;
  note: string;
}

export type Counters = Record<RemetryEventType, number>;

const ZERO: Counters = { error: 0, api: 0, perf: 0, replay: 0 };

interface EventLogValue {
  entries: LogEntry[];
  counters: Counters;
  /** Record a trigger. `n` lets burst cases count as N in one call. */
  record: (caseId: string, type: RemetryEventType, note: string, n?: number) => void;
  reset: () => void;
}

const EventLogContext = createContext<EventLogValue | null>(null);

export function EventLogProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [counters, setCounters] = useState<Counters>(ZERO);

  const record = useCallback(
    (caseId: string, type: RemetryEventType, note: string, n = 1) => {
      setEntries((prev) =>
        [{ ts: Date.now(), caseId, type, note }, ...prev].slice(0, 200),
      );
      setCounters((prev) => ({ ...prev, [type]: prev[type] + n }));
    },
    [],
  );

  const reset = useCallback(() => {
    setEntries([]);
    setCounters(ZERO);
  }, []);

  const value = useMemo<EventLogValue>(
    () => ({ entries, counters, record, reset }),
    [entries, counters, record, reset],
  );

  return <EventLogContext.Provider value={value}>{children}</EventLogContext.Provider>;
}

export function useEventLog(): EventLogValue {
  const ctx = useContext(EventLogContext);
  if (!ctx) throw new Error("useEventLog must be used within <EventLogProvider>");
  return ctx;
}
