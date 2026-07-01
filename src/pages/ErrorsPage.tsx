/**
 * Every JS-error capture surface the SDK handles.
 *
 * Subtlety: a synchronous `throw` inside a React handler is swallowed by
 * React, not window.onerror. To reach the global handler installed by
 * errorsPlugin() we schedule the throw on a fresh tick: `setTimeout(() => throw)`.
 * Cases that should be caught locally (manual capture, error cause, the render
 * boundary) don't need that trick.
 */
import { useState, type ReactNode } from "react";
import { captureError } from "@remetry/browser";
import { ErrorBoundary } from "@remetry/browser/react";
import { CaseCard } from "../components/CaseCard";
import { TriggerButton } from "../components/TriggerButton";
import { ExpectedResult } from "../components/ExpectedResult";
import { useEventLog } from "../eventLog";

/** Custom error subclass for the named-grouping case. */
class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentError";
  }
}

interface ErrCase {
  id: string;
  title: string;
  description: string;
  snippet: string;
  note: string;
  count?: number;
  danger?: boolean;
  trigger: () => void;
  expected: { text: ReactNode; dashboard?: string };
}

const CASES: ErrCase[] = [
  {
    id: "err-uncaught-sync",
    title: "Uncaught synchronous error",
    description: "Thrown on a fresh tick so it reaches the global window.onerror handler.",
    snippet: `setTimeout(() => { throw new Error("ERR-01 uncaught") }, 0)`,
    note: "uncaught Error → window.onerror",
    trigger: () => setTimeout(() => { throw new Error("ERR-01 uncaught sync error"); }, 0),
    expected: {
      text: <>New/updated issue with this <code>message</code> and a stack trace.</>,
      dashboard: "Issues",
    },
  },
  {
    id: "err-unhandled-rejection",
    title: "Unhandled promise rejection",
    description: "A rejected promise with no .catch — caught by the unhandledrejection listener.",
    snippet: `Promise.reject(new Error("ERR-02"))  // no .catch`,
    note: "unhandled rejection",
    trigger: () => { void Promise.reject(new Error("ERR-02 unhandled rejection")); },
    expected: { text: <>Issue created from the rejection.</>, dashboard: "Issues" },
  },
  {
    id: "err-manual-capture",
    title: "Manual captureError() from a catch",
    description: "A SyntaxError caught in a try/catch and reported explicitly.",
    snippet: `try { JSON.parse("{ bad ]") } catch (e) { captureError(e) }`,
    note: "manual captureError (SyntaxError)",
    trigger: () => {
      try {
        JSON.parse("{ bad ]");
      } catch (e) {
        captureError(e as Error);
      }
    },
    expected: { text: <>Issue with <code>name=SyntaxError</code>.</>, dashboard: "Issues" },
  },
  {
    id: "err-typeerror",
    title: "TypeError — null/undefined deref",
    description: "Reading a property off undefined raises a TypeError on the global handler.",
    snippet: `const o = {}; o.a.b   // Cannot read properties of undefined`,
    note: "TypeError",
    trigger: () => setTimeout(() => { const o: any = {}; void o.a.b; }, 0),
    expected: { text: <>Issue with <code>name=TypeError</code>.</>, dashboard: "Issues" },
  },
  {
    id: "err-referenceerror",
    title: "ReferenceError — undefined symbol",
    description: "Indirect eval calls an undefined function, raising a ReferenceError.",
    snippet: `(0, eval)("nope__undef()")`,
    note: "ReferenceError",
    trigger: () =>
      setTimeout(() => {
        const indirectEval = eval;
        indirectEval("nope__undef()");
      }, 0),
    expected: { text: <>Issue with <code>name=ReferenceError</code>.</>, dashboard: "Issues" },
  },
  {
    id: "err-throw-nonerror",
    title: "Throw a non-Error value",
    description: "Throwing a bare string exercises the SDK's non-Error normalisation.",
    snippet: `throw "boom-string"   // not an Error instance`,
    note: "non-Error throw (string)",
    danger: true,
    trigger: () => setTimeout(() => { throw "boom-string"; }, 0),
    expected: {
      text: <>Issue with sensible <code>name</code>/<code>message</code> — confirms normalisation.</>,
      dashboard: "Issues",
    },
  },
  {
    id: "err-custom-name",
    title: "Custom Error subclass (PaymentError)",
    description: "A named subclass should drive issue grouping/title by its name.",
    snippet: `class PaymentError extends Error {…}; throw new PaymentError(…)`,
    note: "custom error name",
    trigger: () => setTimeout(() => { throw new PaymentError("ERR-08 payment declined"); }, 0),
    expected: { text: <>Issue grouped/titled by <code>PaymentError</code>.</>, dashboard: "Issues" },
  },
  {
    id: "err-error-cause",
    title: "Error with cause chain",
    description: "An outer error wrapping an inner cause, reported via captureError.",
    snippet: `new Error("outer", { cause: new Error("inner") })`,
    note: "error cause chain",
    trigger: () => captureError(new Error("ERR-09 outer", { cause: new Error("inner cause") })),
    expected: {
      text: <>Issue keeps the outer error (and the <code>cause</code> where supported).</>,
      dashboard: "Issues",
    },
  },
  {
    id: "err-async-await",
    title: "Async/await rejection (no try/catch)",
    description: "An awaited failing call with no handler surfaces as an unhandled rejection.",
    snippet: `async () => { await failing() }   // no try/catch`,
    note: "async/await rejection",
    trigger: () => {
      const failing = async () => { throw new Error("ERR-10 async chain"); };
      const run = async () => { await failing(); };
      void run();
    },
    expected: { text: <>Issue from the async rejection chain.</>, dashboard: "Issues" },
  },
  {
    id: "err-stack-overflow",
    title: "Stack overflow (RangeError)",
    description: "Unbounded recursion exhausts the call stack.",
    snippet: `const r = () => r(); r()   // Maximum call stack size exceeded`,
    note: "RangeError (stack overflow)",
    danger: true,
    trigger: () =>
      setTimeout(() => {
        const recurse = (): number => recurse();
        recurse();
      }, 0),
    expected: { text: <>Issue with <code>name=RangeError</code>.</>, dashboard: "Issues" },
  },
  {
    id: "err-grouping-burst",
    title: "Grouping burst — same error ×5",
    description: "Five identical throws should collapse into one issue with count=5 (server-side grouping).",
    snippet: `for (i<5) setTimeout(() => throw new Error("same message"))`,
    note: "identical error ×5",
    count: 5,
    danger: true,
    trigger: () => {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => { throw new Error("ERR-12 burst (same message)"); }, 0);
      }
    },
    expected: {
      text: <><strong>One</strong> issue with <code>count=5</code> — confirms grouping.</>,
      dashboard: "Issues",
    },
  },
];

/** Render-time crash, contained by a local boundary so the page stays alive. */
function Crasher({ boom }: { boom: boolean }) {
  if (boom) {
    throw new Error("ERR-03 render crash in <Crasher> (caught by ErrorBoundary)");
  }
  return <p className="crasher-ok">Component healthy ✓</p>;
}

function BoundaryCase() {
  const { record } = useEventLog();
  const [boom, setBoom] = useState(false);
  const [armKey, setArmKey] = useState(0);

  return (
    <CaseCard
      id="err-boundary-crash"
      title="Render crash caught by <ErrorBoundary>"
      description="A component throws during render; the SDK's ErrorBoundary reports it and shows a fallback."
      snippet={`<ErrorBoundary fallback={…}><Crasher boom /></ErrorBoundary>`}
      expected={
        <ExpectedResult dashboard="Issues">
          Issue created; fallback UI shown; the stack points at <code>Crasher</code>.
        </ExpectedResult>
      }
    >
      <button
        type="button"
        data-testid="err-boundary-crash"
        className="danger"
        onClick={() => {
          record("err-boundary-crash", "error", "render crash → ErrorBoundary");
          setBoom(true);
        }}
      >
        Crash component
      </button>
      <button
        type="button"
        onClick={() => {
          setBoom(false);
          setArmKey((k) => k + 1);
        }}
      >
        Reset boundary
      </button>
      <div className="boundary-stage">
        <ErrorBoundary
          key={armKey}
          fallback={
            <div className="fallback">
              Component tree crashed — fallback shown, error reported to Remetry.
            </div>
          }
        >
          <Crasher boom={boom} />
        </ErrorBoundary>
      </div>
    </CaseCard>
  );
}

export function ErrorsPage() {
  return (
    <>
      <h1>Errors</h1>
      <p className="page-intro">
        Each case produces an <code>error</code> event via a different path —
        global handlers, unhandled rejections, the React boundary, or manual{" "}
        <code>captureError()</code>. After clicking, give it a few seconds (the
        SDK flushes every 3s) and check Issues in your dashboard.
      </p>

      <BoundaryCase />

      {CASES.map((c) => (
        <CaseCard
          key={c.id}
          id={c.id}
          title={c.title}
          description={c.description}
          snippet={c.snippet}
          expected={
            <ExpectedResult dashboard={c.expected.dashboard}>{c.expected.text}</ExpectedResult>
          }
        >
          <TriggerButton
            id={c.id}
            label="Trigger"
            type="error"
            note={c.note}
            count={c.count}
            danger={c.danger}
            onTrigger={c.trigger}
          />
        </CaseCard>
      ))}
    </>
  );
}
