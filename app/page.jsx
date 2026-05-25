import Link from "next/link";
import "./landing.css";

const FEATURES = [
  {
    title: "Accurate by construction",
    body: "Real geometry from exported Revit models, lit with a consistent studio rig. Removes AI guesswork on shape, scale, or lighting.",
  },
  {
    title: "Real builder swatches",
    body: "Paint colors and material veneers come straight from the providers your builders actually use, so what a designer picks is what gets ordered.",
  },
  {
    title: "Fast and cheap",
    body: "Swap a color scheme or a stone veneer and see it instantly in the browser. No manual modeling pass, no render queue.",
  },
  {
    title: "Shareable links",
    body: "Every model, paint, and material selection lives in the URL. Copy the link and a client or colleague opens the exact same design.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Load the model",
    body: "Exported Revit homes are grouped by shared materials and labeled for the pipeline, then loaded as GLB.",
  },
  {
    step: "02",
    title: "Apply swatches",
    body: "Each material group pulls from a swatch file of approved options: veneers, paints, and finishes the catalogue supports.",
  },
  {
    step: "03",
    title: "Tune and share",
    body: "Per-material UV scales keep textures coherent across models. Adjust the design, then share the link.",
  },
];

export default function LandingPage() {
  return (
    <main className="landing">
      <header className="landing-nav">
        <span className="brand">homeview</span>
        <Link className="nav-cta" href="/viewer">
          Open viewer
        </Link>
      </header>

      <section className="hero">
        <p className="eyebrow">For realtors &amp; home designers</p>
        <h1>
          See the home you&apos;re designing,
          <br />
          exactly as it will be built.
        </h1>
        <p className="hero-sub">
          Homeview is a fast three.js rendering pipeline for visualizing home
          color schemes and designs across property developments — accurate
          geometry, real builder swatches, and faithful color, right in the
          browser.
        </p>
        <div className="hero-actions">
          <Link className="btn btn-primary" href="/viewer">
            Launch the viewer
          </Link>
          <a className="btn btn-ghost" href="#how-it-works">
            How it works
          </a>
        </div>
      </section>

      <section className="features" aria-label="Features">
        {FEATURES.map((f) => (
          <article key={f.title} className="feature-card">
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </article>
        ))}
      </section>

      <section id="how-it-works" className="how">
        <h2>How it works</h2>
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s.step} className="step">
              <span className="step-num">{s.step}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="cta-band">
        <h2>Ready to visualize a design?</h2>
        <p>
          Pick a model, drop in a color scheme, and share the result in seconds.
        </p>
        <Link className="btn btn-primary" href="/viewer">
          Open the viewer
        </Link>
      </section>

      <footer className="landing-footer">
        <span className="brand">homeview</span>
        <span className="footer-note">Built for View Homes</span>
      </footer>
    </main>
  );
}
