/**
 * Self-documenting wrapper around one demo case: id chip, title, description,
 * a code snippet of what fires, the trigger control(s) (children), and the
 * expected-result block.
 */
import type { ReactNode } from "react";

export interface CaseCardProps {
  id: string;
  title: string;
  description: string;
  snippet: string;
  /** Trigger control(s). */
  children: ReactNode;
  /** An <ExpectedResult> describing what appears in Remetry. */
  expected: ReactNode;
}

export function CaseCard({ id, title, description, snippet, children, expected }: CaseCardProps) {
  return (
    <section className="case-card" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>
        <span className="case-id">{id}</span>
        {title}
      </h3>
      <p className="desc">{description}</p>
      <pre>{snippet}</pre>
      <div className="case-controls">{children}</div>
      {expected}
    </section>
  );
}
