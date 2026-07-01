/**
 * A single case trigger. Clicking records the trigger in the EventLog *first*
 * (so the entry survives even when the handler intentionally throws on a later
 * tick), then runs `onTrigger`.
 */
import { useEventLog, type RemetryEventType } from "../eventLog";

export interface TriggerButtonProps {
  id: string;
  label: string;
  /** Capture surface this trigger exercises — drives the log pill + counter. */
  type: RemetryEventType;
  /** Log note; defaults to the label. */
  note?: string;
  /** How many events this click is expected to produce (burst cases). */
  count?: number;
  danger?: boolean;
  onTrigger: () => void | Promise<void>;
}

export function TriggerButton({
  id,
  label,
  type,
  note,
  count = 1,
  danger,
  onTrigger,
}: TriggerButtonProps) {
  const { record } = useEventLog();

  const handleClick = async () => {
    record(id, type, note ?? label, count);
    try {
      await onTrigger();
    } catch {
      /* Some triggers throw by design; the global handlers report them. */
    }
  };

  return (
    <button
      type="button"
      data-testid={id}
      className={danger ? "danger" : undefined}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}
