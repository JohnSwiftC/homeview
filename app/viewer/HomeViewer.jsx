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
        <button id="ai-open" type="button">
          Generate AI Image
        </button>
        <div id="status"></div>
      </div>
      <canvas id="viewport"></canvas>

      <div id="ai-modal" className="modal hidden">
        <div className="modal-backdrop" id="ai-backdrop"></div>
        <div className="modal-panel">
          <div className="modal-header">
            <h2 className="modal-title">AI Render</h2>
            <button className="modal-close" id="ai-close" type="button">
              ×
            </button>
          </div>
          <div id="ai-content">
            <div id="ai-form">
              <div id="ai-auth">
                <button id="ai-connect" type="button">
                  Connect OpenRouter account
                </button>
                <p className="ai-note">
                  You&apos;ll be redirected to OpenRouter to sign in. Image
                  generation is billed to your own OpenRouter credits, never to
                  us. You can set a spending limit on OpenRouter.
                </p>
              </div>
              <div id="ai-connected" className="hidden">
                <div className="ai-connected-row">
                  <span className="ai-connected-badge">
                    ✓ Connected to OpenRouter
                  </span>
                  <button id="ai-disconnect" className="ai-link" type="button">
                    Disconnect
                  </button>
                </div>
                <div className="ai-field">
                  <span className="ai-field-label">Model</span>
                  <div id="ai-model" className="ai-model">
                    <button
                      id="ai-model-trigger"
                      type="button"
                      className="ai-model-trigger"
                      aria-expanded="false"
                    >
                      <span id="ai-model-current">Loading models…</span>
                      <span className="ai-model-caret" aria-hidden="true">
                        ▾
                      </span>
                    </button>
                    <div id="ai-model-list" className="ai-model-list hidden"></div>
                  </div>
                </div>
                <label>
                  Add to the scene (optional)
                  <textarea
                    id="ai-extra"
                    rows="2"
                    placeholder="e.g. at dusk, autumn trees, mountains behind"
                  ></textarea>
                </label>
                <button id="ai-start" type="button">
                  Select area to generate
                </button>
              </div>
              <div id="ai-refine" className="hidden">
                <img id="ai-ref-img" alt="Your selected view" />
                <label>
                  Tune the prompt, then regenerate
                  <textarea
                    id="ai-refine-input"
                    rows="3"
                    placeholder="Describe changes — e.g. warmer evening light, add a porch"
                  ></textarea>
                </label>
                <button id="ai-regen" type="button">
                  Regenerate
                </button>
              </div>
              <div id="ai-status"></div>
            </div>
            <div id="ai-result"></div>
          </div>
        </div>
      </div>

      <div id="ai-select" className="hidden">
        <div id="ai-select-surface"></div>
        <div id="ai-select-box" className="hidden"></div>
        <div id="ai-select-bar">
          <span id="ai-select-msg"></span>
          <button id="ai-sel-draw" type="button" className="ai-secondary">
            Draw box
          </button>
          <button id="ai-sel-go" type="button" className="hidden">
            Generate from selection
          </button>
          <button id="ai-sel-redo" type="button" className="ai-secondary hidden">
            Redo
          </button>
          <button id="ai-sel-back" type="button" className="ai-secondary hidden">
            Back
          </button>
          <button id="ai-sel-cancel" type="button" className="ai-link hidden">
            Cancel
          </button>
        </div>
      </div>

      <div id="loading-overlay">
        <div className="loading-box">
          <div className="spinner"></div>
          <div id="loading-message">Loading…</div>
        </div>
      </div>
    </>
  );
}
