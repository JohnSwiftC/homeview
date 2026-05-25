import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  MODELS,
  PAINT_COLORS,
  PAINT_MATERIAL_NAME,
  IGNORED_MATERIALS,
  MATERIAL_LABELS,
  GROUP_SWATCHES,
  TEXTURE_SCALES,
} from "./config.js";

// Imperative three.js viewer. Called once from HomeViewer's effect after the
// UI shell has mounted; returns a cleanup that tears the scene down again.
export default function initViewer() {
  const canvas = document.getElementById("viewport");
  const modelSelect = document.getElementById("model-select");
  const groupsContainer = document.getElementById("material-groups");
  const paintContainer = document.getElementById("paint-container");
  const copyLinkBtn = document.getElementById("copy-link");
  const status = document.getElementById("status");
  const loadingOverlay = document.getElementById("loading-overlay");
  const loadingMessage = document.getElementById("loading-message");

  // Full-screen loading overlay. Kept visible until the model AND all of its
  // material swatches are ready, so the model is never shown half-loaded.
  function showLoading(message) {
    loadingMessage.textContent = message;
    loadingOverlay.classList.remove("hidden", "error");
  }
  function setLoadingMessage(message) {
    loadingMessage.textContent = message;
  }
  function hideLoading() {
    loadingOverlay.classList.add("hidden");
  }
  function showLoadingError(message) {
    loadingMessage.textContent = message;
    loadingOverlay.classList.remove("hidden");
    loadingOverlay.classList.add("error");
  }

  // --- Full-screen modal selector: compact trigger button opens a labeled tile grid. ---
  let activeModal = null;
  function closeActiveModal() {
    if (activeModal) {
      activeModal.classList.add("hidden");
      activeModal = null;
    }
  }
  function onKeyDown(e) {
    if (e.key === "Escape") closeActiveModal();
  }
  document.addEventListener("keydown", onKeyDown);

  // items: [{ value, label }]; previewFor(item, size) -> HTMLElement (fresh each call)
  function createSelector({ key, label, items, initialValue, onChange, previewFor }) {
    const wrapper = document.createElement("div");
    wrapper.className = "selector";
    wrapper.dataset.stateKey = key;

    if (label) {
      const labelEl = document.createElement("div");
      labelEl.className = "selector-label";
      labelEl.textContent = label;
      wrapper.appendChild(labelEl);
    }

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "selector-trigger";
    const triggerPreview = document.createElement("span");
    triggerPreview.className = "selector-preview";
    const triggerText = document.createElement("span");
    triggerText.className = "selector-text";
    trigger.appendChild(triggerPreview);
    trigger.appendChild(triggerText);
    wrapper.appendChild(trigger);

    // Modal lives inside the wrapper but uses position:fixed to cover the viewport.
    // Living inside means it's cleaned up automatically when the wrapper is removed.
    const modal = document.createElement("div");
    modal.className = "modal hidden";
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const panel = document.createElement("div");
    panel.className = "modal-panel";
    const header = document.createElement("div");
    header.className = "modal-header";
    const title = document.createElement("h2");
    title.className = "modal-title";
    title.textContent = label ?? "";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "modal-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "×";
    const grid = document.createElement("div");
    grid.className = "modal-grid";
    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);
    panel.appendChild(grid);
    modal.appendChild(backdrop);
    modal.appendChild(panel);
    wrapper.appendChild(modal);

    backdrop.addEventListener("click", closeActiveModal);
    closeBtn.addEventListener("click", closeActiveModal);

    const tilesByValue = new Map();
    for (const item of items) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "tile";
      tile.dataset.value = item.value;

      const previewBox = document.createElement("div");
      previewBox.className = "tile-preview";
      previewBox.appendChild(previewFor(item, 256));

      const tileLabel = document.createElement("div");
      tileLabel.className = "tile-label";
      tileLabel.textContent = item.label;

      tile.appendChild(previewBox);
      tile.appendChild(tileLabel);
      tile.addEventListener("click", () => {
        setValue(item.value, true);
        closeActiveModal();
      });
      grid.appendChild(tile);
      tilesByValue.set(item.value, tile);
    }

    function setValue(value, fire = false) {
      const item = items.find((i) => i.value === value) ?? items[0];
      if (!item) return;
      wrapper.dataset.value = item.value;
      triggerPreview.innerHTML = "";
      triggerPreview.appendChild(previewFor(item, 24));
      triggerText.textContent = item.label;
      for (const [v, tile] of tilesByValue) tile.classList.toggle("active", v === item.value);
      if (fire) onChange(item.value, item);
    }

    trigger.addEventListener("click", () => {
      if (modal.classList.contains("hidden")) {
        closeActiveModal();
        modal.classList.remove("hidden");
        activeModal = modal;
      } else {
        closeActiveModal();
      }
    });

    setValue(initialValue, false);
    return { element: wrapper, setValue, getValue: () => wrapper.dataset.value };
  }

  // Single knob for how strongly the environment (RoomEnvironment) lights surfaces.
  // Higher = brighter, more lit-from-all-sides look. ~1.0–2.0 is the useful range.
  const ENV_INTENSITY = 0.7;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // NoToneMapping keeps surface colors faithful to the input hex (ACES Filmic
  // darkened/hue-shifted them, esp. reds). Trade-off: no highlight roll-off, so
  // keep the lighting rig below tighter so bright albedos (e.g. Arctic White)
  // don't clip to white.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000,
  );
  camera.position.set(5, 4, 6);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.target.set(0, 1, 0);

  // Studio-style rig: warm key + cool fill from opposite side + back/rim, over a
  // hemisphere ambient. No shadow casters — nothing goes dark. Intensities are
  // kept modest because NoToneMapping has no highlight roll-off: the aggregate
  // irradiance on the brightest face should stay near ~1.0 so colors render close
  // to their albedo and high-value paints don't clip. Scale these together to
  // brighten/darken the whole scene.
  const hemi = new THREE.HemisphereLight(0xfff2e0, 0x8a99b3, 0.55);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff0d8, 0.7);
  key.position.set(6, 9, 5);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xc8d8ff, 0.4);
  fill.position.set(-7, 5, -3);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 0.25);
  rim.position.set(0, 6, -8);
  scene.add(rim);

  const underfill = new THREE.DirectionalLight(0xfff5e8, 0.15);
  underfill.position.set(0, -4, 2);
  scene.add(underfill);

  const loader = new GLTFLoader();
  let currentModel = null;
  let paintMaterials = []; // all unique material instances named MainPaint on the current model
  const swatchFileCache = new Map(); // url -> Promise<Material[]>

  function populateSelect(select, items) {
    select.innerHTML = "";
    for (const item of items) {
      const opt = document.createElement("option");
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
    camera.position
      .copy(center)
      .add(new THREE.Vector3(size * 0.7, size * 0.5, size * 0.7));
    camera.near = size / 100;
    camera.far = size * 100;
    camera.updateProjectionMatrix();
  }

  // Remove every Light authored inside the gltf so only our rig is active.
  function stripLights(root) {
    const toRemove = [];
    root.traverse((n) => {
      if (n.isLight) toRemove.push(n);
    });
    for (const l of toRemove) l.parent?.remove(l);
    return toRemove.length;
  }

  function prepareMaterial(mat) {
    if (mat && "envMapIntensity" in mat) mat.envMapIntensity = ENV_INTENSITY;
  }

  function prepareModelMaterials(root) {
    root.traverse((n) => {
      if (!n.isMesh || !n.material) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of mats) prepareMaterial(m);
    });
  }

  function collectPaintMaterials(root, name) {
    const seen = new Set();
    root.traverse((n) => {
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
    root.traverse((n) => {
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

  // Load one .glb and return every unique material inside it (insertion order).
  // Cached per URL so the same file shared across groups is fetched once.
  function loadSwatchFile(url) {
    if (swatchFileCache.has(url)) return swatchFileCache.get(url);
    const promise = (async () => {
      try {
        const gltf = await loader.loadAsync(url);
        const seen = new Set();
        const mats = [];
        gltf.scene.traverse((n) => {
          if (!n.isMesh || !n.material) return;
          const arr = Array.isArray(n.material) ? n.material : [n.material];
          for (const m of arr) {
            if (m.name && !seen.has(m.name)) {
              prepareMaterial(m);
              seen.add(m.name);
              mats.push(m);
            }
          }
        });
        return mats;
      } catch (err) {
        console.warn(`Swatch file not loaded (${url}):`, err.message);
        return [];
      }
    })();
    swatchFileCache.set(url, promise);
    return promise;
  }

  // Build groupName -> Map<materialName, Material> by loading each group's listed files.
  async function loadSwatchesForGroups(groups) {
    const result = new Map();
    await Promise.all(
      groups.map(async (group) => {
        const urls = GROUP_SWATCHES[group.name] ?? [];
        const perGroup = new Map();
        const fileLists = await Promise.all(urls.map(loadSwatchFile));
        for (const list of fileLists) {
          for (const mat of list) {
            if (!perGroup.has(mat.name)) perGroup.set(mat.name, mat);
          }
        }
        result.set(group.name, perGroup);
      }),
    );
    return result;
  }

  // Texture map slots on standard / physical materials that should follow the group's tiling.
  const TEXTURE_MAP_KEYS = [
    "map",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "aoMap",
    "emissiveMap",
    "bumpMap",
    "displacementMap",
    "alphaMap",
  ];

  // Resolve the [u, v] scale for a given group + swatch (or null swatch for the default material).
  // Falls back: per-swatch override → group default → none.
  function resolveScale(groupEntry, swatchName) {
    if (!groupEntry) return null;
    if (Array.isArray(groupEntry)) return groupEntry;
    if (swatchName && groupEntry.swatches?.[swatchName])
      return groupEntry.swatches[swatchName];
    return groupEntry.group ?? null;
  }

  function applyTextureScale(material, scale) {
    if (!material || scale == null) return;
    if (!Array.isArray(scale) || scale.length < 2) {
      console.warn("Texture scale must be [u, v]. Got:", scale);
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

  // Draw a small preview of `material` (basecolor texture if present, else solid color).
  function makeMaterialPreview(material, size = 44) {
    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = size;
    previewCanvas.height = size;
    const ctx = previewCanvas.getContext("2d");
    const img = material?.map?.image;
    if (img && (img.width || img.naturalWidth)) {
      try {
        ctx.drawImage(img, 0, 0, size, size);
        return previewCanvas;
      } catch {
        /* fall through to color fill */
      }
    }
    const c = material?.color
      ? material.color.clone().convertLinearToSRGB()
      : new THREE.Color(0x888888);
    ctx.fillStyle = `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
    ctx.fillRect(0, 0, size, size);
    return previewCanvas;
  }

  function makeColorPreview(hex) {
    const div = document.createElement("div");
    div.style.background = `#${hex.toString(16).padStart(6, "0")}`;
    return div;
  }

  function buildGroupUI(groups, swatchesByGroup, modelScales) {
    groupsContainer.innerHTML = "";
    for (const group of groups) {
      const displayName = MATERIAL_LABELS[group.name] ?? group.name;
      const swatchMap = swatchesByGroup.get(group.name) ?? new Map();
      const groupScaleEntry = modelScales[group.name];

      applyTextureScale(
        group.defaultMaterial,
        resolveScale(groupScaleEntry, null),
      );

      const items = [
        { value: "__default__", label: group.name, material: group.defaultMaterial },
        ...[...swatchMap].map(([name, mat]) => ({ value: name, label: name, material: mat })),
      ];

      const selector = createSelector({
        key: group.name,
        label: displayName,
        items,
        initialValue: "__default__",
        previewFor: (item, size) => makeMaterialPreview(item.material, size),
        onChange: (value, item) => {
          applyTextureScale(
            item.material,
            resolveScale(groupScaleEntry, value === "__default__" ? null : value),
          );
          for (const mesh of group.meshes) mesh.material = item.material;
          updateUrlFromState();
        },
      });
      groupsContainer.appendChild(selector.element);
    }
  }

  async function loadModel(modelDef) {
    showLoading(`Loading ${modelDef.label}…`);
    status.textContent = `Loading ${modelDef.label}…`;
    if (currentModel) {
      scene.remove(currentModel);
      currentModel.traverse((n) => {
        if (n.isMesh) n.geometry?.dispose();
      });
      currentModel = null;
      paintMaterials = [];
      groupsContainer.innerHTML = "";
    }
    try {
      const gltf = await loader.loadAsync(modelDef.url);
      currentModel = gltf.scene;
      const removed = stripLights(currentModel);
      if (removed > 0)
        console.log(
          `Stripped ${removed} embedded light(s) from ${modelDef.label}.`,
        );
      prepareModelMaterials(currentModel);
      scene.add(currentModel);
      frameObject(currentModel);

      paintMaterials = collectPaintMaterials(currentModel, PAINT_MATERIAL_NAME);
      if (paintMaterials.length === 0) {
        status.textContent = `Loaded ${modelDef.label}, but no material named "${PAINT_MATERIAL_NAME}" was found.`;
      } else {
        status.textContent = `Loaded ${modelDef.label}`;
        applyPaintColor(PAINT_COLORS.find((c) => c.id === paintSelector.getValue()));
      }

      // Material swatches (stone veneer, etc.) load separately and can take a
      // while. Finish them before dismissing the overlay so the model isn't
      // revealed with its swatch options still missing.
      setLoadingMessage("Loading materials…");
      const excluded = new Set([PAINT_MATERIAL_NAME, ...IGNORED_MATERIALS]);
      const groups = collectMaterialGroups(currentModel, excluded);
      const swatchesByGroup = await loadSwatchesForGroups(groups);
      const modelScales = TEXTURE_SCALES[modelDef.id] ?? {};
      buildGroupUI(groups, swatchesByGroup, modelScales);

      if (!appliedInitialGroupParams) {
        appliedInitialGroupParams = true;
        applyInitialGroupParams();
      }
      updateUrlFromState();
      hideLoading();
    } catch (err) {
      status.textContent = `Failed: ${err.message}`;
      showLoadingError(`Failed to load: ${err.message}`);
      console.error(err);
    }
  }

  function applyPaintColor(colorDef) {
    if (!colorDef || paintMaterials.length === 0) return;
    for (const m of paintMaterials) {
      // ColorManagement is on (three r160), so setHex treats the hex as sRGB
      // and converts to the linear working space for us.
      m.color.setHex(colorDef.hex);
      m.needsUpdate = true;
    }
  }

  let appliedInitialGroupParams = false;

  function updateUrlFromState() {
    const params = new URLSearchParams();
    if (modelSelect.value) params.set("model", modelSelect.value);
    for (const sel of document.querySelectorAll(".selector[data-state-key]")) {
      const val = sel.dataset.value;
      if (val && val !== "__default__") params.set(sel.dataset.stateKey, val);
    }
    const qs = params.toString();
    history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  function applyInitialGroupParams() {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of params) {
      if (key === "model" || key === "paint") continue;
      const sel = groupsContainer.querySelector(
        `.selector[data-state-key="${CSS.escape(key)}"]`,
      );
      if (!sel) continue;
      const tile = sel.querySelector(`.modal-grid .tile[data-value="${CSS.escape(value)}"]`);
      if (tile) tile.click();
    }
  }

  populateSelect(modelSelect, MODELS);

  const initialParams = new URLSearchParams(window.location.search);
  const initialPaintId = initialParams.get("paint");
  const startingPaintId =
    initialPaintId && PAINT_COLORS.some((c) => c.id === initialPaintId)
      ? initialPaintId
      : PAINT_COLORS[0]?.id;
  const initialModelId = initialParams.get("model");
  const startModel = MODELS.find((m) => m.id === initialModelId) ?? MODELS[0];

  const paintSelector = createSelector({
    key: "paint",
    label: "Paint Color",
    items: PAINT_COLORS.map((c) => ({ value: c.id, label: c.label, hex: c.hex })),
    initialValue: startingPaintId,
    previewFor: (item) => makeColorPreview(item.hex),
    onChange: (value) => {
      const def = PAINT_COLORS.find((c) => c.id === value);
      if (def) applyPaintColor(def);
      updateUrlFromState();
    },
  });
  paintContainer.appendChild(paintSelector.element);

  function onModelChange() {
    const def = MODELS.find((m) => m.id === modelSelect.value);
    if (def) loadModel(def);
  }
  modelSelect.addEventListener("change", onModelChange);

  async function onCopyLink() {
    const original = copyLinkBtn.textContent;
    try {
      await navigator.clipboard.writeText(window.location.href);
      copyLinkBtn.textContent = "Copied!";
    } catch {
      copyLinkBtn.textContent = "Copy failed";
    }
    setTimeout(() => {
      copyLinkBtn.textContent = original;
    }, 1500);
  }
  copyLinkBtn.addEventListener("click", onCopyLink);

  if (startModel) {
    modelSelect.value = startModel.id;
    loadModel(startModel);
  } else {
    status.textContent = "No models configured. Add entries to config.js.";
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);

  let rafId = 0;
  function tick() {
    controls.update();
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }
  tick();

  // Teardown: stop the loop, drop listeners, and free GPU resources so a
  // remount (or React Fast Refresh in dev) doesn't leak a second renderer.
  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("keydown", onKeyDown);
    modelSelect.removeEventListener("change", onModelChange);
    copyLinkBtn.removeEventListener("click", onCopyLink);
    controls.dispose();
    pmrem.dispose();
    renderer.dispose();
  };
}
