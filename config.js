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
