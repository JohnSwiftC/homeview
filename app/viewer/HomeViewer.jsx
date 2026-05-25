"use client";

import { useEffect, useRef } from "react";
import "./viewer.css";

// Renders the static UI shell, then hands the DOM to the imperative three.js
// viewer. `viewer` is imported dynamically inside the effect so three.js (and
// its browser globals) are only ever evaluated on the client, never during SSR.
export default function HomeViewer() {
  const startedRef = useRef(false);

  // Lock scrolling / size the page to the viewport only while the viewer is
  // mounted. Removing the class on unmount lets other routes scroll normally.
  useEffect(() => {
    document.body.classList.add("viewer-active");
    return () => document.body.classList.remove("viewer-active");
  }, []);

  useEffect(() => {
    if (startedRef.current) return; // guard against double-init
    startedRef.current = true;

    let cleanup = () => {};
    let cancelled = false;

    import("./viewer").then(({ default: initViewer }) => {
      if (cancelled) return;
      cleanup = initViewer() ?? (() => {});
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return (
    <>
      <div id="ui">
        <label>
          Model
          <select id="model-select"></select>
        </label>
        <div id="paint-container"></div>
        <div id="material-groups"></div>
        <button id="copy-link" type="button">
          Copy Link
        </button>
        <div id="status"></div>
      </div>
      <canvas id="viewport"></canvas>
      <div id="loading-overlay">
        <div className="loading-box">
          <div className="spinner"></div>
          <div id="loading-message">Loading…</div>
        </div>
      </div>
    </>
  );
}
