export const MODELS = [
  { id: "mvphome", label: "mvphome", url: "/models/mvphome.glb" },
];

export const PAINT_MATERIAL_NAME = "MainPaint";
export const PAINT_COLORS = [
  { id: "arctic_white", label: "Arctic White", hex: 0xe0e0d8 },
  { id: "cobble_stone", label: "Cobble Stone", hex: 0xc6beb0 },
  { id: "navajo_beige", label: "Navajo Beige", hex: 0xd5c9b2 },
  { id: "khaki_brown", label: "Khaki Brown", hex: 0xa28f7d },
  { id: "monterey_taupe", label: "Monterey Taupe", hex: 0xa19a8b },
  { id: "timber_bark", label: "Timber Bark", hex: 0x7b7064 },
  { id: "rich_espresso", label: "Rich Espresso", hex: 0x5f5a55 },
  { id: "mountain_sage", label: "Mountain Sage", hex: 0x706f5e },
  { id: "light_mist", label: "Light Mist", hex: 0xb6bab5 },
  { id: "pearl_gray", label: "Pearl Gray", hex: 0xb2aea9 },
  { id: "gray_slate", label: "Gray Slate", hex: 0x898a87 },
  { id: "boothbay_blue", label: "Boothbay Blue", hex: 0x778184 },
  { id: "evening_blue", label: "Evening Blue", hex: 0x5f696d },
  { id: "deep_ocean", label: "Deep Ocean", hex: 0x49545c },
  { id: "aged_pewter", label: "Aged Pewter", hex: 0x7d7974 },
  { id: "night_gray", label: "Night Gray", hex: 0x6a6d6f },
  { id: "iron_gray", label: "Iron Gray", hex: 0x575b59 },
  { id: "countrylane_red", label: "Countrylane Red", hex: 0x714d47 },
  { id: "midnight_black", label: "Midnight Black", hex: 0x3d3e3e },
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
  RusticStone: ["/models/swatches/veneers.glb"],
};

// can mess with material scaling here,
// in a model, pick the default material for a group,
// set the default group UV, and if needed, you can also
// go into the individual swatches
export const TEXTURE_SCALES = {
  mvphome: {
    RusticStone: { group: [0.2, 0.2], swatches: {} },
  },
};
