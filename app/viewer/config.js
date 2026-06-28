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

export const GROUP_SWATCHES = {
  RusticStone: ["/models/swatches/veneers.glb"],
};

export const AI_IMAGE = {
  MODEL: "google/gemini-3.1-flash-image-preview",

  SYSTEM_PROMPT:
    "Turn this 3D render of a house into a realistic photograph. Keep the house " +
    "and its setting exactly as shown — same building shape, roof, windows, doors, " +
    "proportions, paint color, stone veneer, ground, and camera angle. Only make " +
    "the materials and lighting look real, with natural daylight. Do not add, " +
    "remove, or move any object.",

  CAPTURE_MAX: 1280, // px, longest edge of the captured selection
  SKY_COLOR: 0x9fc4e8, // capture backdrop: soft sky blue
  GROUND_COLOR: 0x7e8b63, // capture ground plane: muted grass/olive

  // Quality is a hand-maintained judgement (OpenRouter has no quality signal),
  // shown as a tag in the model picker. Keyed by a substring of the model id;
  // first match wins, so list more specific ids first. tier drives the color.
  // The cost tag, by contrast, is computed live from each model's output price.
  MODEL_QUALITY: [
    { match: "gemini-3-pro-image", tier: "top", label: "Top" },
    { match: "gpt-5.4-image", tier: "top", label: "Top" },
    { match: "gpt-5-image-mini", tier: "good", label: "Good" },
    { match: "gpt-5-image", tier: "high", label: "High" },
    { match: "gemini-3.1-flash-image", tier: "high", label: "High" },
    { match: "gemini-2.5-flash-image", tier: "high", label: "High" },
  ],
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
