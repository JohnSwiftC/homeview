// Add entries here as you drop more .glb / .gltf files into ./models/
export const MODELS = [
  { id: "mvphome", label: "mvphome", url: "./models/mvphome.glb" },
  // { id: 'house-b', label: 'House B', url: './models/house-b.glb' },
];

// Colors applied to the material named "MainPaint" in the gltf.
// The material itself (roughness, normal map, etc.) stays as authored in Blender —
// only the base color is mutated.
export const PAINT_MATERIAL_NAME = "MainPaint";
export const PAINT_COLORS = [
  { id: "linen",     label: "Linen",      hex: 0xf2ede2 },
  { id: "sage",      label: "Sage",       hex: 0x8a9a7b },
  { id: "clay",      label: "Clay",       hex: 0xb87654 },
  { id: "navy",      label: "Navy",       hex: 0x2b3a55 },
  { id: "charcoal",  label: "Charcoal",   hex: 0x3a3a3a },
  { id: "butter",    label: "Butter",     hex: 0xefd9a1 },
];
