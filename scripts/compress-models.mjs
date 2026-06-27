// Offline texture compression for the served GLB models.
//
// The models are almost entirely texture data (geometry is a few KB), so the
// win is resizing the oversized textures and re-encoding them to WebP. WebP is
// decoded natively by three.js GLTFLoader (EXT_texture_webp) in every modern
// browser, so no runtime loader changes are needed.
//
// Source of truth lives in models-src/ (gitignored, full-res Blender exports).
// This script reads from there and writes optimized GLBs into public/models/,
// which are the paths the app actually serves. Re-run after re-exporting:
//
//   npm run compress:models
//
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Cap textures at this size. Color/emissive use lossy WebP; normal, roughness,
// and occlusion are linear data maps and get higher quality to avoid artifacts.
const MAX_SIZE = 2048;
const COLOR_QUALITY = 82;
const DATA_QUALITY = 92;

const JOBS = [
  { src: "models-src/mvphome.glb", out: "public/models/mvphome.glb" },
  { src: "models-src/swatches/veneers.glb", out: "public/models/swatches/veneers.glb" },
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const mb = (n) => (n / 1024 / 1024).toFixed(2) + " MB";

for (const job of JOBS) {
  const srcPath = path.join(ROOT, job.src);
  const outPath = path.join(ROOT, job.out);
  const before = fs.statSync(srcPath).size;

  const document = await io.read(srcPath);

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

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await io.write(outPath, document);
  const after = fs.statSync(outPath).size;

  console.log(
    `${job.src.padEnd(34)} ${mb(before).padStart(10)} -> ${mb(after).padStart(10)}` +
      `  (${(100 * (1 - after / before)).toFixed(1)}% smaller)`,
  );
}
