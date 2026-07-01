/**
 * Optional pre-render main-thread block, used by the Performance page's
 * load-time cases (spec §6.3: `perf-slow-load`, `perf-fcp`).
 *
 * Navigation-timing metrics (FCP / DCL / Load) are fixed at page load, so a
 * button click after the app is up can't degrade them. Instead those cases
 * reload the page with a query flag; this runs at the very top of main.tsx —
 * before the SDK inits or React paints — and busy-waits, pushing first paint and
 * the load event later. The performance plugin then reports the worse FCP/Load.
 *
 *   ?perfSlow[=ms]  → block ~2.5s (default): degrades DCL / Load
 *   ?perfFcp[=ms]   → block ~1.5s (default): degrades First Contentful Paint
 *
 * A single busy-wait degrades FCP, DCL and Load together (it just delays
 * everything that follows); the two flags only differ in the default duration.
 * Capped at 6s so a stray flag can't wedge the harness.
 */
export function maybeBlockForSlowLoad(): void {
  try {
    if (typeof location === "undefined") return;
    const params = new URLSearchParams(location.search);
    const slow = params.get("perfSlow");
    const fcp = params.get("perfFcp");
    let ms = 0;
    if (slow !== null) ms = Number(slow) || 2500;
    else if (fcp !== null) ms = Number(fcp) || 1500;
    if (ms <= 0) return;
    const end = Date.now() + Math.min(ms, 6000);
    // Synchronous spin: holds the main thread so paint/load can't complete.
    while (Date.now() < end) {
      /* intentional busy-wait */
    }
  } catch {
    /* never block the harness from starting over a bad flag */
  }
}
