import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  MODELS,
  PAINT_COLORS,
  PAINT_MATERIAL_NAME,
  IGNORED_MATERIALS,
  MATERIAL_LABELS,
  SWATCH_LIBRARY_URL,
  GROUP_SWATCHES,
  TEXTURE_SCALES,
} from './config.js';

const canvas = document.getElementById('viewport');
const modelSelect = document.getElementById('model-select');
const paintSelect = document.getElementById('paint-select');
const groupsContainer = document.getElementById('material-groups');
const status = document.getElementById('status');

// Single knob for how strongly the environment (RoomEnvironment) lights surfaces.
// Higher = brighter, more lit-from-all-sides look. ~1.0–2.0 is the useful range.
const ENV_INTENSITY = 1.4;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 4, 6);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

// Studio-style rig: warm key + cool fill from opposite side + back/rim,
// over a strong hemisphere ambient. No shadow casters — nothing goes dark.
const hemi = new THREE.HemisphereLight(0xfff2e0, 0x8a99b3, 0.9);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff0d8, 1.6);
key.position.set(6, 9, 5);
scene.add(key);

const fill = new THREE.DirectionalLight(0xc8d8ff, 0.9);
fill.position.set(-7, 5, -3);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xffffff, 0.5);
rim.position.set(0, 6, -8);
scene.add(rim);

const underfill = new THREE.DirectionalLight(0xfff5e8, 0.3);
underfill.position.set(0, -4, 2);
scene.add(underfill);

const loader = new GLTFLoader();
let currentModel = null;
let paintMaterials = []; // all unique material instances named MainPaint on the current model
let swatchLibraryPromise = null; // lazy-loaded Map<name, Material>

function populateSelect(select, items) {
  select.innerHTML = '';
  for (const item of items) {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.label;
    select.appendChild(opt);
  }
}

function frameObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3()).length();
  const center = box.getCenter(new THREE.Vector3());
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(size * 0.7, size * 0.5, size * 0.7));
  camera.near = size / 100;
  camera.far = size * 100;
  camera.updateProjectionMatrix();
}

// Remove every Light authored inside the gltf so only our rig is active.
function stripLights(root) {
  const toRemove = [];
  root.traverse(n => { if (n.isLight) toRemove.push(n); });
  for (const l of toRemove) l.parent?.remove(l);
  return toRemove.length;
}

function prepareMaterial(mat) {
  if (mat && 'envMapIntensity' in mat) mat.envMapIntensity = ENV_INTENSITY;
}

function prepareModelMaterials(root) {
  root.traverse(n => {
    if (!n.isMesh || !n.material) return;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    for (const m of mats) prepareMaterial(m);
  });
}

function collectPaintMaterials(root, name) {
  const seen = new Set();
  root.traverse(n => {
    if (!n.isMesh) return;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    for (const m of mats) {
      if (m && m.name === name) seen.add(m);
    }
  });
  return [...seen];
}

// Group all meshes by the name of their material, skipping any names in `excludedNames`.
// Returns [{ name, defaultMaterial, meshes: [...] }, ...]
function collectMaterialGroups(root, excludedNames) {
  const groups = new Map();
  root.traverse(n => {
    if (!n.isMesh || !n.material || Array.isArray(n.material)) return;
    const m = n.material;
    if (!m.name || excludedNames.has(m.name)) return;
    let g = groups.get(m.name);
    if (!g) {
      g = { name: m.name, defaultMaterial: m, meshes: [] };
      groups.set(m.name, g);
    }
    g.meshes.push(n);
  });
  return [...groups.values()];
}

// Load every material from the swatch library file into a Map<name, Material>.
// Returns an empty map (and warns) if the file is missing or fails to load.
async function loadSwatchLibrary(url) {
  const swatches = new Map();
  try {
    const gltf = await loader.loadAsync(url);
    gltf.scene.traverse(n => {
      if (!n.isMesh || !n.material) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of mats) {
        if (m.name && !swatches.has(m.name)) {
          prepareMaterial(m);
          swatches.set(m.name, m);
        }
      }
    });
  } catch (err) {
    console.warn(`Swatch library not loaded (${url}):`, err.message);
  }
  return swatches;
}

// Texture map slots on standard / physical materials that should follow the group's tiling.
const TEXTURE_MAP_KEYS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
  'emissiveMap', 'bumpMap', 'displacementMap', 'alphaMap',
];

// Resolve the [u, v] scale for a given group + swatch (or null swatch for the default material).
// Falls back: per-swatch override → group default → none.
function resolveScale(groupEntry, swatchName) {
  if (!groupEntry) return null;
  if (Array.isArray(groupEntry)) return groupEntry;
  if (swatchName && groupEntry.swatches?.[swatchName]) return groupEntry.swatches[swatchName];
  return groupEntry.group ?? null;
}

function applyTextureScale(material, scale) {
  if (!material || scale == null) return;
  if (!Array.isArray(scale) || scale.length < 2) {
    console.warn('Texture scale must be [u, v]. Got:', scale);
    return;
  }
  const [u, v] = scale;
  for (const key of TEXTURE_MAP_KEYS) {
    const tex = material[key];
    if (!tex) continue;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(u, v);
    tex.needsUpdate = true;
  }
}

function buildGroupUI(groups, swatches, modelScales) {
  groupsContainer.innerHTML = '';
  for (const group of groups) {
    const displayName = MATERIAL_LABELS[group.name] ?? group.name;
    const swatchNames = GROUP_SWATCHES[group.name] ?? [];
    const groupScaleEntry = modelScales[group.name];

    applyTextureScale(group.defaultMaterial, resolveScale(groupScaleEntry, null));

    const label = document.createElement('label');
    label.textContent = displayName;
    const select = document.createElement('select');

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '__default__';
    defaultOpt.textContent = group.name;
    select.appendChild(defaultOpt);

    const resolved = new Map(); // option value -> Material
    for (const name of swatchNames) {
      const mat = swatches.get(name);
      if (!mat) {
        console.warn(`Swatch "${name}" listed for group "${group.name}" but not found in library.`);
        continue;
      }
      const o = document.createElement('option');
      o.value = name;
      o.textContent = name;
      select.appendChild(o);
      resolved.set(name, mat);
    }

    select.addEventListener('change', () => {
      const isDefault = select.value === '__default__';
      const replacement = isDefault ? group.defaultMaterial : resolved.get(select.value);
      if (!replacement) return;
      applyTextureScale(replacement, resolveScale(groupScaleEntry, isDefault ? null : select.value));
      for (const mesh of group.meshes) mesh.material = replacement;
    });

    label.appendChild(select);
    groupsContainer.appendChild(label);
  }
}

async function loadModel(modelDef) {
  status.textContent = `Loading ${modelDef.label}…`;
  if (currentModel) {
    scene.remove(currentModel);
    currentModel.traverse(n => {
      if (n.isMesh) n.geometry?.dispose();
    });
    currentModel = null;
    paintMaterials = [];
    groupsContainer.innerHTML = '';
  }
  try {
    const gltf = await loader.loadAsync(modelDef.url);
    currentModel = gltf.scene;
    const removed = stripLights(currentModel);
    if (removed > 0) console.log(`Stripped ${removed} embedded light(s) from ${modelDef.label}.`);
    prepareModelMaterials(currentModel);
    scene.add(currentModel);
    frameObject(currentModel);

    paintMaterials = collectPaintMaterials(currentModel, PAINT_MATERIAL_NAME);
    if (paintMaterials.length === 0) {
      status.textContent = `Loaded ${modelDef.label}, but no material named "${PAINT_MATERIAL_NAME}" was found.`;
    } else {
      status.textContent = `Loaded ${modelDef.label}`;
      applyPaintColor(PAINT_COLORS.find(c => c.id === paintSelect.value));
    }

    const excluded = new Set([PAINT_MATERIAL_NAME, ...IGNORED_MATERIALS]);
    const groups = collectMaterialGroups(currentModel, excluded);
    if (!swatchLibraryPromise) swatchLibraryPromise = loadSwatchLibrary(SWATCH_LIBRARY_URL);
    const swatches = await swatchLibraryPromise;
    const modelScales = TEXTURE_SCALES[modelDef.id] ?? {};
    buildGroupUI(groups, swatches, modelScales);
  } catch (err) {
    status.textContent = `Failed: ${err.message}`;
    console.error(err);
  }
}

function applyPaintColor(colorDef) {
  if (!colorDef || paintMaterials.length === 0) return;
  for (const m of paintMaterials) {
    m.color.setHex(colorDef.hex);
    // gltf base color is in linear space; setHex assumes sRGB, so convert:
    m.color.convertSRGBToLinear();
    m.needsUpdate = true;
  }
}

populateSelect(modelSelect, MODELS);
populateSelect(paintSelect, PAINT_COLORS);

modelSelect.addEventListener('change', () => {
  const def = MODELS.find(m => m.id === modelSelect.value);
  if (def) loadModel(def);
});
paintSelect.addEventListener('change', () => {
  const def = PAINT_COLORS.find(c => c.id === paintSelect.value);
  if (def) applyPaintColor(def);
});

if (MODELS.length > 0) loadModel(MODELS[0]);
else status.textContent = 'No models configured. Add entries to config.js.';

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function tick() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
