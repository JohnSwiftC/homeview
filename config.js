export const MODELS = [
  { id: "mvphome", label: "mvphome", url: "./models/mvphome.glb" },
];

export const PAINT_MATERIAL_NAME = "MainPaint";
export const PAINT_COLORS = [
  { id: "linen", label: "Linen", hex: 0xf2ede2 },
  { id: "sage", label: "Sage", hex: 0x8a9a7b },
  { id: "clay", label: "Clay", hex: 0xb87654 },
  { id: "navy", label: "Navy", hex: 0x2b3a55 },
  { id: "charcoal", label: "Charcoal", hex: 0x3a3a3a },
  { id: "butter", label: "Butter", hex: 0xefd9a1 },
];

// Material names to skip when building per-group swap dropdowns.
export const IGNORED_MATERIALS = ["Shingles"];

// Override how a material's name appears in the UI.
// Keys are the raw material name from the gltf; values are what the user sees.
export const MATERIAL_LABELS = {
  RusticStone: "Stone Veneer",
};

// For each group, list one or more .glb files. Every material found inside each
// file becomes a swatch option for that group. Organize however you like — one
// big file per group (e.g. "veneers.glb" containing every stone option), one
// file per swatch, or any mix. Display name = the material's name in Blender.
// The same file under multiple groups is fetched only once.
export const GROUP_SWATCHES = {
  RusticStone: ["./models/swatches/veneers.glb"],
};

// can mess with material scaling here,
// in a model, pick the default material for a group,
// set the default group UV, and if needed, you can also
// go into the individual swatches
export const TEXTURE_SCALES = {
  mvphome: {
    RusticStone: { group: [0.2, 0.2], swatches: { RedBrick: [0.15, 0.15] } },
  },
};
