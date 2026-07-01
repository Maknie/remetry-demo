/**
 * "What appears in Remetry, and where to look." Each case states the
 * expectation in prose plus an optional dashboard location.
 */
import type { ReactNode } from "react";

export interface ExpectedResultProps {
  children: ReactNode;
  /** Dashboard location, e.g. "Issues" or "API monitoring". */
  dashboard?: string;
}

export function ExpectedResult({ children, dashboard }: ExpectedResultProps) {
  return (
    <div className="expected">
      <div className="lbl">What you’ll see in Remetry</div>
      <div>{children}</div>
      {dashboard && (
        <div className="where">
          <span>
            Dashboard: <span className="tag">{dashboard}</span>
          </span>
        </div>
      )}
    </div>
  );
}
