import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MODELS, PAINT_COLORS, PAINT_MATERIAL_NAME } from './config.js';

const canvas = document.getElementById('viewport');
const modelSelect = document.getElementById('model-select');
const paintSelect = document.getElementById('paint-select');
const status = document.getElementById('status');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 4, 6);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(5, 10, 7);
scene.add(sun);

const loader = new GLTFLoader();
let currentModel = null;
let paintMaterials = []; // all unique material instances named MainPaint on the current model

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

async function loadModel(modelDef) {
  status.textContent = `Loading ${modelDef.label}…`;
  if (currentModel) {
    scene.remove(currentModel);
    currentModel.traverse(n => {
      if (n.isMesh) n.geometry?.dispose();
    });
    currentModel = null;
    paintMaterials = [];
  }
  try {
    const gltf = await loader.loadAsync(modelDef.url);
    currentModel = gltf.scene;
    scene.add(currentModel);
    frameObject(currentModel);

    paintMaterials = collectPaintMaterials(currentModel, PAINT_MATERIAL_NAME);
    if (paintMaterials.length === 0) {
      status.textContent = `Loaded ${modelDef.label}, but no material named "${PAINT_MATERIAL_NAME}" was found.`;
    } else {
      status.textContent = `Loaded ${modelDef.label}`;
      applyPaintColor(PAINT_COLORS.find(c => c.id === paintSelect.value));
    }
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
