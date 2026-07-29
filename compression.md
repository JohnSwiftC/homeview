# Model & Swatch Compression

Due to model size, it makes sense to compress the model textures down to WebP before use. This accomplishes two things: keep load times low, and keep the size of the repo being hosted on vercel low as well.

# Doing It

The full size models are placed within models-src, an ignored directory. Drop the exports straight in — every `.glb` under `models-src/` is picked up automatically, and subdirectories (like `swatches/`) are mirrored into `public/models/`.

Compress the models and throw the output to where they need to be with `npm run compress:models`.

File names are slugified on the way out, so `models-src/140-1526-DM-MODERN PRAIRIE.glb` is served as `/models/140-1526-dm-modern-prairie.glb`. The run also rewrites `app/viewer/models.generated.js`, which is the model list the picker reads — that file is generated, so don't hand-edit it. Labels come from the file name (`129-1105-dm-farmhouse` shows as `129-1105 — Farmhouse`), which means renaming a source file renames it in the UI.

Outputs that are newer than their source are skipped, so re-exporting one plan only re-encodes that plan. Flags:

- `npm run compress:models -- --force` — re-encode everything (use after changing quality settings)
- `npm run compress:models -- --filter=229` — only sources whose path contains `229`
- `npm run compress:models -- --jobs=2` — concurrency, defaults to 4
