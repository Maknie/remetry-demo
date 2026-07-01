/**
 * Tenancy & limits — server-config dependent.
 *
 * Unlike the other pages, these cases don't produce Remetry events — they probe
 * the *server's rejection codes* directly and show the observed HTTP status.
 *
 * - Ingestion (:8080) sends `Access-Control-Allow-Origin: *`, so the DSN /
 *   origin / rate-limit / quota probes return a readable 401/403/429/202 in the
 *   browser.
 * - The product API (:8081) only allows the dashboard origin by default
 *   (DASHBOARD_ORIGIN), so from this origin the API probes are usually
 *   CORS-blocked — start the API with DASHBOARD_ORIGIN allowing this origin
 *   (or "*"). The probes degrade gracefully and say so.
 *
 * Several cases only reject under specific server env (origin allow-list, a
 * daily quota, a revoked key); each card states its precondition and a "no
 * restriction configured" result is reported as neutral, not a failure.
 */
import { useState } from "react";
import { remetryConfig } from "../remetry";
import { CaseCard } from "../components/CaseCard";
import { ExpectedResult } from "../components/ExpectedResult";

type Kind = "ok" | "warn" | "err" | "muted";
interface Result {
  kind: Kind;
  label: string;
  detail?: string;
}

const FOREIGN_PROJECT = "ffffffff-ffff-ffff-ffff-ffffffffffff";

/** The product API base (:8081), derived from the ingestion endpoint's host. */
function apiBase(): string {
  try {
    const u = new URL(remetryConfig.endpoint);
    u.port = "8081";
    u.pathname = "";
    u.search = "";
    return u.origin;
  } catch {
    return "http://localhost:8081";
  }
}

/** POST a minimal batch under `dsn` (n events) to the ingestion endpoint. */
function postBatch(dsn: string, n = 1): Promise<Response> {
  const events = Array.from({ length: n }, () => ({
    type: "error",
    timestamp: new Date().toISOString(),
    error: { name: "LimitProbe", message: "tenancy/limits probe" },
  }));
  return fetch(remetryConfig.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dsn, schemaVersion: 1, events }),
  });
}

/** Map an observed code against the expected one(s). */
function classify(code: number, expected: number[]): Result {
  return {
    kind: expected.includes(code) ? "ok" : "warn",
    label: `HTTP ${code}`,
    detail: expected.includes(code) ? "as expected" : `expected ${expected.join("/")}`,
  };
}

export function LimitsPage() {
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState("demo@remetry.local");
  const [password, setPassword] = useState("remetry");
  const [auth, setAuth] = useState<{ token: string; projectId: string } | null>(null);
  const [authMsg, setAuthMsg] = useState<Result | null>(null);

  const set = (id: string, r: Result) => setResults((p) => ({ ...p, [id]: r }));

  const run = async (id: string, fn: () => Promise<Result>) => {
    setBusy(id);
    try {
      set(id, await fn());
    } catch (e) {
      // A thrown fetch from the API is almost always the CORS block.
      set(id, {
        kind: "muted",
        label: "blocked",
        detail: "network/CORS — is the stack up & this origin allowed?",
      });
      void e;
    } finally {
      setBusy(null);
    }
  };

  // ---- ingestion probes (:8080, wildcard CORS) --------------------------
  const probeInvalidDsn = async (): Promise<Result> =>
    classify((await postBatch("invalid-dsn-not-allowlisted")).status, [401]);

  const probeRevokedKey = async (): Promise<Result> =>
    classify((await postBatch("revoked-demo-key")).status, [401]);

  const probeBadOrigin = async (): Promise<Result> => {
    const code = (await postBatch(remetryConfig.dsn)).status;
    if (code === 403) return { kind: "ok", label: "HTTP 403", detail: "origin rejected" };
    return {
      kind: "muted",
      label: `HTTP ${code}`,
      detail: "no origin allow-list excludes this origin (set one to see 403)",
    };
  };

  const probeRateLimit = async (): Promise<Result> => {
    const codes = await Promise.all(
      Array.from({ length: 250 }, () => postBatch(remetryConfig.dsn).then((r) => r.status, () => 0)),
    );
    const tally = codes.reduce<Record<number, number>>((m, c) => ((m[c] = (m[c] ?? 0) + 1), m), {});
    const detail = Object.entries(tally)
      .map(([c, n]) => `${c}×${n}`)
      .join(" · ");
    const tripped = (tally[429] ?? 0) > 0;
    return {
      kind: tripped ? "ok" : "warn",
      label: tripped ? `429 ×${tally[429]}` : "no 429",
      detail,
    };
  };

  const probeDailyQuota = async (): Promise<Result> => {
    const code = (await postBatch(remetryConfig.dsn, 5)).status;
    if (code === 429) return { kind: "ok", label: "HTTP 429", detail: "over quota" };
    return {
      kind: "muted",
      label: `HTTP ${code}`,
      detail: "quota unlimited (set DEFAULT_DAILY_EVENT_QUOTA>0)",
    };
  };

  // ---- product API probes (:8081, origin-restricted) --------------------
  const signIn = async () => {
    setBusy("signin");
    try {
      const res = await fetch(`${apiBase()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setAuthMsg({ kind: "warn", label: `login ${res.status}`, detail: "check credentials" });
        return;
      }
      const { token } = (await res.json()) as { token?: string };
      if (!token) {
        setAuthMsg({ kind: "warn", label: "no token", detail: "login returned no token" });
        return;
      }
      const meRes = await fetch(`${apiBase()}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const me = (await meRes.json()) as { projects?: Array<{ id: string }> };
      const projectId = me.projects?.[0]?.id ?? "";
      setAuth({ token, projectId });
      setAuthMsg({ kind: "ok", label: "signed in", detail: `project ${projectId.slice(0, 8)}…` });
    } catch {
      setAuthMsg({
        kind: "muted",
        label: "blocked",
        detail: "CORS — start the API with DASHBOARD_ORIGIN allowing this origin",
      });
    } finally {
      setBusy(null);
    }
  };

  const probeApiUnauth = async (): Promise<Result> =>
    classify((await fetch(`${apiBase()}/issues`)).status, [401]);

  const probeApiCrossTenant = async (): Promise<Result> => {
    if (!auth) return { kind: "muted", label: "sign in first", detail: "needs a token" };
    const res = await fetch(`${apiBase()}/issues?projectId=${FOREIGN_PROJECT}`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    return classify(res.status, [403]);
  };

  const probeApiScoped = async (): Promise<Result> => {
    if (!auth) return { kind: "muted", label: "sign in first", detail: "needs a token" };
    const res = await fetch(`${apiBase()}/issues?projectId=${auth.projectId}`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    return classify(res.status, [200]);
  };

  const Probe = ({ id, label, onRun }: { id: string; label: string; onRun: () => void }) => {
    const r = results[id];
    return (
      <>
        <div className="case-controls">
          <button type="button" data-testid={id} onClick={onRun} disabled={busy === id}>
            {busy === id ? "running…" : label}
          </button>
        </div>
        <div className="probe-row" data-testid={`${id}-result`}>
          {r ? (
            <>
              <span className={`status-pill ${r.kind}`}>{r.label}</span>
              {r.detail && <span className="probe-detail">{r.detail}</span>}
            </>
          ) : (
            <span className="probe-detail">not run yet</span>
          )}
        </div>
      </>
    );
  };

  return (
    <>
      <h1>Tenancy &amp; Limits</h1>
      <p className="page-intro">
        These cases probe the server's rejection codes directly (no Remetry event) and
        show the observed HTTP status. Ingestion (<code>:8080</code>) allows any origin,
        so the DSN / origin / rate-limit / quota probes work in the browser; the product
        API (<code>:8081</code>) is origin-restricted, so its probes need{" "}
        <code>DASHBOARD_ORIGIN</code> to allow this origin.
      </p>

      <div className="note">
        <strong>Preconditions vary per case.</strong> A neutral grey result means the
        relevant limit isn't configured (e.g. no origin allow-list or unlimited quota) —
        that's not a failure, just nothing to reject. Green means the server rejected (or
        allowed) exactly as expected.
      </div>

      <h2 className="section-heading">Ingestion (:8080)</h2>

      <CaseCard
        id="lim-invalid-dsn"
        title="Invalid DSN → 401"
        description="A DSN that isn't in the allow-list. Ingestion should reject the batch outright."
        snippet={`POST /ingest/events { dsn: "invalid-dsn-not-allowlisted" }`}
        expected={<ExpectedResult>Rejected with <code>401</code>; no events stored.</ExpectedResult>}
      >
        <Probe id="lim-invalid-dsn" label="Send with bad DSN" onRun={() => run("lim-invalid-dsn", probeInvalidDsn)} />
      </CaseCard>

      <CaseCard
        id="lim-revoked-key"
        title="Revoked key → 401"
        description="A key marked revoked is filtered out. Needs a key configured as revoked; an unknown key also yields 401."
        snippet={`POST /ingest/events { dsn: "<revoked>" }`}
        expected={<ExpectedResult>Rejected with <code>401</code> (revoked-key filter).</ExpectedResult>}
      >
        <Probe id="lim-revoked-key" label="Send with revoked key" onRun={() => run("lim-revoked-key", probeRevokedKey)} />
      </CaseCard>

      <CaseCard
        id="lim-bad-origin"
        title="Disallowed origin → 403"
        description="Browsers can't spoof Origin, so this sends the valid DSN from this origin; it's 403 only if the project's origin allow-list excludes this origin."
        snippet={`POST /ingest/events (Origin: ${typeof location !== "undefined" ? location.origin : "…"})`}
        expected={<ExpectedResult><code>403</code> when an origin allow-list excludes this origin.</ExpectedResult>}
      >
        <Probe id="lim-bad-origin" label="Send from this origin" onRun={() => run("lim-bad-origin", probeBadOrigin)} />
      </CaseCard>

      <CaseCard
        id="lim-rate-limit"
        title="Rate limit → some 429"
        description="A burst of 250 batches in ~one tick. Above the server's burst limit (default 200) some are throttled."
        snippet={`Promise.all(250 × POST /ingest/events)`}
        expected={<ExpectedResult>A portion return <code>429</code> (the rest 202).</ExpectedResult>}
      >
        <Probe id="lim-rate-limit" label="Flood (250×)" onRun={() => run("lim-rate-limit", probeRateLimit)} />
      </CaseCard>

      <CaseCard
        id="lim-daily-quota"
        title="Daily quota → 429"
        description="Sends a small batch; rejected once the day's quota is exceeded. Default quota is 0 (unlimited)."
        snippet={`POST /ingest/events (5 events)`}
        expected={<ExpectedResult><code>429</code> once over the daily event quota.</ExpectedResult>}
      >
        <Probe id="lim-daily-quota" label="Send batch" onRun={() => run("lim-daily-quota", probeDailyQuota)} />
      </CaseCard>

      <h2 className="section-heading">Product API (:8081)</h2>

      <div className="case-card">
        <h3>
          <span className="case-id">lim-signin</span>Sign in (for the scoped / cross-tenant probes)
        </h3>
        <p className="desc">
          The seeded demo user of a local stack. A token is needed for the
          tenant-isolation probes below. Requires the API to allow this origin.
        </p>
        <div className="replay-form">
          <label>
            Email
            <input data-testid="lim-email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input data-testid="lim-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        </div>
        <div className="case-controls signin-controls">
          <button type="button" data-testid="lim-signin" onClick={signIn} disabled={busy === "signin"}>
            {busy === "signin" ? "signing in…" : auth ? "Re-sign in" : "Sign in"}
          </button>
        </div>
        <div className="probe-row">
          {authMsg ? (
            <>
              <span className={`status-pill ${authMsg.kind}`}>{authMsg.label}</span>
              {authMsg.detail && <span className="probe-detail">{authMsg.detail}</span>}
            </>
          ) : (
            <span className="probe-detail">not signed in</span>
          )}
        </div>
      </div>

      <CaseCard
        id="lim-api-unauth"
        title="Unauthenticated API read → 401"
        description="A data request to the product API with no token. The read path is closed."
        snippet={`GET :8081/issues   // no Authorization`}
        expected={<ExpectedResult>Rejected with <code>401</code>.</ExpectedResult>}
      >
        <Probe id="lim-api-unauth" label="GET /issues (no token)" onRun={() => run("lim-api-unauth", probeApiUnauth)} />
      </CaseCard>

      <CaseCard
        id="lim-api-cross-tenant"
        title="Cross-tenant read → 403"
        description="A signed-in request for a projectId the caller doesn't own — tenant isolation should refuse it."
        snippet={`GET :8081/issues?projectId=<foreign>   // with token`}
        expected={<ExpectedResult>Rejected with <code>403</code> (tenant isolation).</ExpectedResult>}
      >
        <Probe id="lim-api-cross-tenant" label="GET foreign project" onRun={() => run("lim-api-cross-tenant", probeApiCrossTenant)} />
      </CaseCard>

      <CaseCard
        id="lim-api-scoped"
        title="Scoped read → 200"
        description="The same request for the caller's own project should succeed and return only their data."
        snippet={`GET :8081/issues?projectId=<own>   // with token`}
        expected={<ExpectedResult>Allowed with <code>200</code>; only the caller's data.</ExpectedResult>}
      >
        <Probe id="lim-api-scoped" label="GET own project" onRun={() => run("lim-api-scoped", probeApiScoped)} />
      </CaseCard>
    </>
  );
}
