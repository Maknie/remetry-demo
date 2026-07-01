import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { initRemetry, bindPagehideFlush } from "./remetry";
import { maybeBlockForSlowLoad } from "./slowLoad";
import { App } from "./App";
import "./styles.css";

// Performance page: when launched with ?perfSlow / ?perfFcp, hold the main
// thread before anything else so first paint and the load event land late —
// the only way to degrade load-time vitals, which are fixed at page load.
maybeBlockForSlowLoad();

// Initialise the SDK once, before the app renders, so the very first
// navigation-timing/web-vitals and any early errors are captured. This is the
// exact pattern a real consumer uses.
initRemetry();
bindPagehideFlush();

const container = document.getElementById("root");
if (!container) throw new Error("#root element not found in index.html");

createRoot(container).render(
  <React.StrictMode>
    {/* basename = Vite base: локально "/", на GitHub Pages "/<repo>/" */}
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
