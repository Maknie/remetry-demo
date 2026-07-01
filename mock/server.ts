/**
 * In-process mock API for the API/network page.
 *
 * Mounted into the Vite dev server as middleware under `/__mock` (see
 * vite.config.ts), so it needs no separate process and works offline. It exists
 * to give the `api-*` cases *controlled* statuses, delays, and CORS behaviour —
 * the SDK's fetch/XHR patch then captures the call and the dashboard's API
 * monitoring screen shows it.
 *
 * Routes (base = VITE_MOCK_API_BASE, default http://localhost:5174/__mock):
 *   GET  /ok                      → 200
 *   GET  /status/:code            → echoes that HTTP status (4xx/5xx cases)
 *   GET  /delay/:ms               → 200 after :ms (slow / high-P95 case)
 *   GET  /users/:id/orders/:oid   → 200 (URL-normalisation case — server
 *                                   collapses :id/:oid into one template)
 *   GET  /no-cors                 → 200 but with NO CORS headers, so a
 *                                   *cross-origin* fetch is blocked → status 0
 *   POST /echo                    → 200, echoes the JSON body (POST-body case)
 *   *                             → 404
 *
 * CORS: every route except `/no-cors` answers `Access-Control-Allow-Origin: *`
 * so same- and cross-origin calls succeed; `/no-cors` deliberately omits it so
 * the `api-cors-blocked` case (fetched cross-origin) fails the CORS check.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

const PREFIX = "/__mock";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  { cors = true }: { cors?: boolean } = {},
): void {
  res.statusCode = status;
  if (cors) for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
  // 204/304 must carry no body.
  if (status === 204 || status === 304) {
    res.end();
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) data = data.slice(0, 1_000_000); // guard
    });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}

/** Handle one `/__mock/...` request. Returns false if the path isn't ours. */
async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith(PREFIX)) return false;

  const path = url.pathname.slice(PREFIX.length) || "/";
  const method = (req.method ?? "GET").toUpperCase();

  // Preflight — answer any OPTIONS with the permissive CORS headers.
  if (method === "OPTIONS") {
    send(res, 204, null);
    return true;
  }

  // GET /ok
  if (method === "GET" && path === "/ok") {
    send(res, 200, { ok: true, route: "/ok" });
    return true;
  }

  // GET /status/:code
  const statusMatch = path.match(/^\/status\/(\d{3})$/);
  if (method === "GET" && statusMatch) {
    const code = Number(statusMatch[1]);
    send(res, code, { route: "/status/:code", status: code });
    return true;
  }

  // GET /delay/:ms
  const delayMatch = path.match(/^\/delay\/(\d+)$/);
  if (method === "GET" && delayMatch) {
    const ms = Math.min(Number(delayMatch[1]), 10_000); // cap to keep the dev server sane
    await new Promise((r) => setTimeout(r, ms));
    send(res, 200, { route: "/delay/:ms", delayedMs: ms });
    return true;
  }

  // GET /users/:id/orders/:oid
  const ordersMatch = path.match(/^\/users\/([^/]+)\/orders\/([^/]+)$/);
  if (method === "GET" && ordersMatch) {
    send(res, 200, {
      route: "/users/:id/orders/:oid",
      userId: ordersMatch[1],
      orderId: ordersMatch[2],
    });
    return true;
  }

  // GET /no-cors — intentionally NO CORS headers (cross-origin → blocked).
  if (method === "GET" && path === "/no-cors") {
    send(res, 200, { route: "/no-cors", note: "served without CORS headers" }, { cors: false });
    return true;
  }

  // POST /echo
  if (method === "POST" && path === "/echo") {
    const raw = await readBody(req);
    let parsed: unknown = raw;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      /* keep raw string */
    }
    send(res, 200, { route: "/echo", method, body: parsed });
    return true;
  }

  send(res, 404, { error: "mock route not found", path });
  return true;
}

/** Vite plugin: mounts the mock API on the dev server (and `vite preview`). */
export function mockApiPlugin(): Plugin {
  const middleware = (
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ) => {
    if (!(req.url ?? "").startsWith(PREFIX)) return next();
    handle(req, res).then(
      (handled) => {
        if (!handled) next();
      },
      (err) => next(err),
    );
  };

  return {
    name: "remetry-demo-mock-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
