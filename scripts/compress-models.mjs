// Offline texture compression for the served GLB models.
//
// The models are almost entirely texture data (geometry is a few KB), so the
// win is resizing the oversized textures and re-encoding them to WebP. WebP is
// decoded natively by three.js GLTFLoader (EXT_texture_webp) in every modern
// browser, so no runtime loader changes are needed.
//
// Source of truth lives in models-src/ (gitignored, full-res Blender exports).
// Every .glb in there is compressed into the matching path under public/models/
// with a URL-safe (slugified) file name, and the model picker list is written
// out to app/viewer/models.generated.js. Re-run after re-exporting:
//
//   npm run compress:models                     # only what changed
//   npm run compress:models -- --force          # redo everything
//   npm run compress:models -- --filter=229     # only sources matching "229"
//   npm run compress:models -- --jobs=2         # tune concurrency
//
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(ROOT, "models-src");
const OUT_DIR = path.join(ROOT, "public", "models");
const MANIFEST = path.join(ROOT, "app", "viewer", "models.generated.js");

// Cap textures at this size. Color/emissive use lossy WebP; normal, roughness,
// and occlusion are linear data maps and get higher quality to avoid artifacts.
const MAX_SIZE = 1024;
const COLOR_QUALITY = 82;
const DATA_QUALITY = 92;

const args = process.argv.slice(2);
const flag = (name) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "";
};
const FORCE = flag("force") !== null;
const FILTER = (flag("filter") ?? "").toLowerCase();
const CONCURRENCY = Math.max(1, Number(flag("jobs")) || 4);

// "140-1526-DM-MODERN PRAIRIE.glb" -> "140-1526-dm-modern-prairie.glb".
// Model names come from the plan exports and contain spaces and mixed case,
// neither of which we want in a URL.
const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const slugifyFile = (file) => `${slug(path.basename(file, ".glb"))}.glb`;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.toLowerCase().endsWith(".glb")) out.push(full);
  }
  return out;
}

if (!fs.existsSync(SRC_DIR)) {
  console.error(`No ${path.relative(ROOT, SRC_DIR)}/ directory — nothing to do.`);
  process.exit(1);
}

const jobs = walk(SRC_DIR)
  .map((srcPath) => {
    const rel = path.relative(SRC_DIR, srcPath);
    const outRel = path.join(
      path.dirname(rel).split(path.sep).map(slug).join(path.sep),
      slugifyFile(rel),
    );
    return { srcPath, outPath: path.join(OUT_DIR, outRel), rel };
  })
  .filter((job) => !FILTER || job.rel.toLowerCase().includes(FILTER))
  .sort((a, b) => a.rel.localeCompare(b.rel, "en", { numeric: true }));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const mb = (n) => (n / 1024 / 1024).toFixed(2) + " MB";

// Up-to-date outputs are skipped so a re-export of one plan doesn't re-encode
// the other 46. --force overrides (e.g. after changing the quality settings).
const isFresh = (job) =>
  !FORCE &&
  fs.existsSync(job.outPath) &&
  fs.statSync(job.outPath).mtimeMs >= fs.statSync(job.srcPath).mtimeMs;

async function compress(job) {
  const before = fs.statSync(job.srcPath).size;
  const document = await io.read(job.srcPath);

  await document.transform(
    dedup(),
    prune(),
    // Color-bearing textures: lossy WebP is fine.
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      slots: /^(baseColor|emissive)/,
      resize: [MAX_SIZE, MAX_SIZE],
      quality: COLOR_QUALITY,
    }),
    // Linear data maps (normals, metalRough, occlusion): keep quality high.
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      slots: /^(normal|metallicRoughness|occlusion)/,
      resize: [MAX_SIZE, MAX_SIZE],
      quality: DATA_QUALITY,
    }),
  );

  fs.mkdirSync(path.dirname(job.outPath), { recursive: true });
  await io.write(job.outPath, document);
  const after = fs.statSync(job.outPath).size;

  console.log(
    `${job.rel.padEnd(34)} ${mb(before).padStart(10)} -> ${mb(after).padStart(10)}` +
      `  (${(100 * (1 - after / before)).toFixed(1)}% smaller)`,
  );
}

// Simple worker pool: the encode is CPU-bound in sharp, so a handful at a time
// keeps the cores busy without holding every 40 MB document in memory at once.
let cursor = 0;
let failures = 0;
let skipped = 0;
async function worker() {
  while (cursor < jobs.length) {
    const job = jobs[cursor++];
    if (isFresh(job)) {
      skipped++;
      continue;
    }
    try {
      await compress(job);
    } catch (err) {
      failures++;
      console.error(`${job.rel.padEnd(34)} FAILED: ${err.message}`);
    }
  }
}

console.log(`${jobs.length} source model(s) in models-src/`);
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker),
);
if (skipped) console.log(`${skipped} already up to date (use --force to redo)`);

// Marketing plan names, keyed by the square footage in the plan number
// ("129-1105" -> 1105 -> Magnolia). Plans without a name here just don't get
// one in the picker.
const PLAN_NAMES = {
  1105: "Magnolia",
  1335: "Cypress",
  1360: "Willow",
  1526: "Logan",
  1569: "Hamilton",
  1584: "Gilmore",
  1664: "Linden",
  1697: "Fairfield 2",
  1851: "Brighton",
  1994: "Hazel",
  2214: "Carson",
  2402: "Danbury",
};

// "129-1105-dm-farmhouse" -> { label: "129-1105 — Farmhouse", name: "Magnolia" }.
// The plan number stays verbatim so it stays searchable in the picker; the
// elevation style is title-cased for display.
function describe(id) {
  const match = /^(\d+)-(\d+)-dm-(.+)$/.exec(id);
  const [plan, sqft, style] = match
    ? [`${match[1]}-${match[2]}`, match[2], match[3]]
    : [null, null, id];
  const pretty = style
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return {
    label: plan ? `${plan} — ${pretty}` : pretty,
    name: PLAN_NAMES[sqft] ?? null,
  };
}

// The picker list is rebuilt from what is actually sitting in public/models,
// not just from this run's jobs, so a filtered run still emits a complete file.
// Only top-level files count: swatch GLBs live in subdirectories and are wired
// up through GROUP_SWATCHES in config.js instead.
function writeManifest() {
  const files = fs.existsSync(OUT_DIR)
    ? fs
        .readdirSync(OUT_DIR, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".glb"))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    : [];

  const entries = files.map((file) => {
    const id = path.basename(file, ".glb");
    const { label, name } = describe(id);
    return (
      `  { id: ${JSON.stringify(id)}, label: ${JSON.stringify(label)}` +
      (name ? `, name: ${JSON.stringify(name)}` : "") +
      `, url: ${JSON.stringify(`/models/${file}`)} },`
    );
  });

  const body =
    "// Generated by `npm run compress:models` — do not edit by hand.\n" +
    "// One entry per compressed model in public/models/.\n" +
    "export const MODELS = [\n" +
    entries.join("\n") +
    (entries.length ? "\n" : "") +
    "];\n";

  fs.writeFileSync(MANIFEST, body);
  console.log(
    `Wrote ${path.relative(ROOT, MANIFEST)} (${files.length} model(s))`,
  );
}

writeManifest();

if (failures) {
  console.error(`${failures} model(s) failed.`);
  process.exit(1);
}
