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
  AI_IMAGE,
} from "./config.js";
import { captureView } from "./aiImage.js";
import {
  beginOAuth,
  completeOAuth,
  generateImage,
  fetchImageModels,
} from "./openrouter.js";

// Imperative three.js viewer. Called once from HomeViewer's effect after the
// UI shell has mounted; returns a cleanup that tears the scene down again.
export default function initViewer() {
  const canvas = document.getElementById("viewport");
  const modelContainer = document.getElementById("model-container");
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

  // items: [{ value, label }]; previewFor(item, size) -> HTMLElement (fresh each
  // call). previewFor is optional: omit it for lists with nothing to show but a
  // name (the models), and the tiles/trigger render as text only.
  function createSelector({
    key,
    label,
    items,
    initialValue,
    onChange,
    previewFor,
  }) {
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
    if (previewFor) trigger.appendChild(triggerPreview);
    else trigger.classList.add("text-only");
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
    grid.className = previewFor ? "modal-grid" : "modal-grid text-only";
    header.appendChild(title);
    header.appendChild(closeBtn);
    const search = document.createElement("input");
    search.type = "search";
    search.className = "modal-search";
    search.placeholder = label ? `Search ${label.toLowerCase()}…` : "Search…";
    panel.appendChild(header);
    panel.appendChild(search);
    panel.appendChild(grid);
    modal.appendChild(backdrop);
    modal.appendChild(panel);
    wrapper.appendChild(modal);

    backdrop.addEventListener("click", closeActiveModal);
    closeBtn.addEventListener("click", closeActiveModal);

    const tilesByValue = new Map();
    const tileEntries = []; // { tile, label } for name filtering
    for (const item of items) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "tile";
      tile.dataset.value = item.value;

      if (previewFor) {
        const previewBox = document.createElement("div");
        previewBox.className = "tile-preview";
        previewBox.appendChild(previewFor(item, 256));
        tile.appendChild(previewBox);
      }

      const tileLabel = document.createElement("div");
      tileLabel.className = "tile-label";
      tileLabel.textContent = item.label;
      tile.appendChild(tileLabel);
      tile.addEventListener("click", () => {
        setValue(item.value, true);
        closeActiveModal();
      });
      grid.appendChild(tile);
      tilesByValue.set(item.value, tile);
      tileEntries.push({ tile, label: (item.label ?? "").toLowerCase() });
    }

    // Filter tiles by name as the user types.
    function applyFilter() {
      const q = search.value.trim().toLowerCase();
      for (const { tile, label } of tileEntries)
        tile.classList.toggle("filtered-out", q !== "" && !label.includes(q));
    }
    search.addEventListener("input", applyFilter);

    function setValue(value, fire = false) {
      const item = items.find((i) => i.value === value) ?? items[0];
      if (!item) return;
      wrapper.dataset.value = item.value;
      if (previewFor) {
        triggerPreview.innerHTML = "";
        triggerPreview.appendChild(previewFor(item, 24));
      }
      triggerText.textContent = item.label;
      for (const [v, tile] of tilesByValue)
        tile.classList.toggle("active", v === item.value);
      if (fire) onChange(item.value, item);
    }

    trigger.addEventListener("click", () => {
      if (modal.classList.contains("hidden")) {
        closeActiveModal();
        search.value = "";
        applyFilter();
        modal.classList.remove("hidden");
        activeModal = modal;
        search.focus();
      } else {
        closeActiveModal();
      }
    });

    setValue(initialValue, false);
    return {
      element: wrapper,
      setValue,
      getValue: () => wrapper.dataset.value,
    };
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
  scene.add(key.target);

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
    const iw = img && (img.width || img.naturalWidth);
    const ih = img && (img.height || img.naturalHeight);
    if (iw && ih) {
      try {
        // Center-crop the source to a square (cover) so non-square textures
        // aren't horizontally squished in the preview.
        const s = Math.min(iw, ih);
        ctx.drawImage(img, (iw - s) / 2, (ih - s) / 2, s, s, 0, 0, size, size);
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
        {
          value: "__default__",
          label: group.name,
          material: group.defaultMaterial,
        },
        ...[...swatchMap].map(([name, mat]) => ({
          value: name,
          label: name,
          material: mat,
        })),
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
            resolveScale(
              groupScaleEntry,
              value === "__default__" ? null : value,
            ),
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
        applyPaintColor(
          PAINT_COLORS.find((c) => c.id === paintSelector.getValue()),
        );
      }

      // Material swatches (stone veneer, etc.) load separately and can take a
      // while. Finish them before dismissing the overlay so the model isn't
      // revealed with its swatch options still missing.
      setLoadingMessage("Loading materials…");
      const excluded = new Set([PAINT_MATERIAL_NAME, ...IGNORED_MATERIALS]);
      const groups = collectMaterialGroups(currentModel, excluded);
      const swatchesByGroup = await loadSwatchesForGroups(groups);
      const modelScales = {
        ...TEXTURE_SCALES.default,
        ...TEXTURE_SCALES[modelDef.id],
      };
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
    // The model picker is itself a .selector (state key "model"), so the loop
    // below covers it along with paint and the material groups.
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
      const tile = sel.querySelector(
        `.modal-grid .tile[data-value="${CSS.escape(value)}"]`,
      );
      if (tile) tile.click();
    }
  }

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
    items: PAINT_COLORS.map((c) => ({
      value: c.id,
      label: c.label,
      hex: c.hex,
    })),
    initialValue: startingPaintId,
    previewFor: (item) => makeColorPreview(item.hex),
    onChange: (value) => {
      const def = PAINT_COLORS.find((c) => c.id === value);
      if (def) applyPaintColor(def);
      updateUrlFromState();
    },
  });
  paintContainer.appendChild(paintSelector.element);

  // Built after the paint selector but inserted above it in the DOM, since the
  // model is the top-level choice. Text-only tiles: there is nothing to preview
  // for a model beyond its plan number and elevation style.
  if (startModel) {
    const modelSelector = createSelector({
      key: "model",
      label: "Model",
      items: MODELS.map((m) => ({ value: m.id, label: m.label })),
      initialValue: startModel.id,
      onChange: (value) => {
        const def = MODELS.find((m) => m.id === value);
        if (def) loadModel(def);
      },
    });
    modelContainer.appendChild(modelSelector.element);
  }

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
    loadModel(startModel);
  } else {
    status.textContent =
      "No models found. Run `npm run compress:models` to build public/models.";
  }

  // --- AI Render (OpenRouter OAuth, billed to the user) -----------------
  const OR_KEY_STORE = "homeview.openrouter_key";
  const OR_MODEL_STORE = "homeview.openrouter_model";
  const aiOpenBtn = document.getElementById("ai-open");
  const aiModal = document.getElementById("ai-modal");
  const aiBackdrop = document.getElementById("ai-backdrop");
  const aiCloseBtn = document.getElementById("ai-close");
  const aiAuth = document.getElementById("ai-auth");
  const aiConnected = document.getElementById("ai-connected");
  const aiConnectBtn = document.getElementById("ai-connect");
  const aiDisconnectBtn = document.getElementById("ai-disconnect");
  const aiModelField = document.getElementById("ai-model");
  const aiModelTrigger = document.getElementById("ai-model-trigger");
  const aiModelCurrent = document.getElementById("ai-model-current");
  const aiModelList = document.getElementById("ai-model-list");
  const aiExtraInput = document.getElementById("ai-extra");
  const aiStatus = document.getElementById("ai-status");
  const aiResult = document.getElementById("ai-result");

  const readKey = () => {
    try {
      return localStorage.getItem(OR_KEY_STORE);
    } catch {
      return null;
    }
  };

  function setAiStatus(message, isError = false) {
    aiStatus.textContent = message;
    aiStatus.classList.toggle("error", isError);
  }

  function reflectConnection() {
    const connected = Boolean(readKey());
    aiAuth.classList.toggle("hidden", connected);
    aiConnected.classList.toggle("hidden", !connected);
  }
  reflectConnection();

  const openAiModal = () => aiModal.classList.remove("hidden");
  const closeAiModal = () => aiModal.classList.add("hidden");
  aiOpenBtn.addEventListener("click", openAiModal);
  aiCloseBtn.addEventListener("click", closeAiModal);
  aiBackdrop.addEventListener("click", closeAiModal);

  // If we just returned from OpenRouter's consent screen, finish the exchange.
  completeOAuth()
    .then((key) => {
      if (!key) return;
      try {
        localStorage.setItem(OR_KEY_STORE, key);
      } catch {
        /* private mode: key lives only for this page session */
      }
      reflectConnection();
      openAiModal();
      setAiStatus("Connected — ready to generate.");
    })
    .catch((err) => {
      reflectConnection();
      openAiModal();
      setAiStatus(`Sign-in failed: ${err.message}`, true);
    });

  function onConnect() {
    // Return to this exact URL so the current design (model/paint/swatches in
    // the query string) is restored after the redirect.
    beginOAuth(window.location.href).catch((err) =>
      setAiStatus(`Could not start sign-in: ${err.message}`, true),
    );
  }
  function onDisconnect() {
    try {
      localStorage.removeItem(OR_KEY_STORE);
    } catch {
      /* ignore */
    }
    reflectConnection();
    setAiStatus("");
  }
  aiConnectBtn.addEventListener("click", onConnect);
  aiDisconnectBtn.addEventListener("click", onDisconnect);

  // Custom model dropdown: a native <select> can't show styled cost/quality
  // tags, so we render our own list. Cost tier is computed from each model's
  // output price; quality is the hand-maintained map in config.
  let selectedModel = AI_IMAGE.MODEL;
  let modelCatalog = [];

  function costInfo(pricing) {
    const perM = (pricing?.completion ?? 0) * 1e6; // $ per million output tokens
    let tier = "low";
    if (perM > 8) tier = "high";
    else if (perM > 3) tier = "mid";
    const text = perM >= 1 ? `$${perM.toFixed(0)}/M` : `$${perM.toFixed(2)}/M`;
    return { tier, text };
  }
  function qualityInfo(id) {
    return (
      (AI_IMAGE.MODEL_QUALITY ?? []).find((q) => id.includes(q.match)) ?? {
        tier: "unknown",
        label: "—",
      }
    );
  }
  function badge(text, kind, tier, title) {
    const span = document.createElement("span");
    span.className = `ai-tag ai-tag-${kind} ai-tag-${tier}`;
    span.textContent = text;
    if (title) span.title = title;
    return span;
  }

  function renderTrigger() {
    const m = modelCatalog.find((x) => x.id === selectedModel);
    aiModelCurrent.textContent = m ? m.name : selectedModel;
  }
  const closeModelList = () => {
    aiModelList.classList.add("hidden");
    aiModelTrigger.setAttribute("aria-expanded", "false");
  };
  function onModelTrigger() {
    const open = aiModelList.classList.toggle("hidden");
    aiModelTrigger.setAttribute("aria-expanded", String(!open));
  }
  function selectModel(id) {
    selectedModel = id;
    try {
      localStorage.setItem(OR_MODEL_STORE, id);
    } catch {
      /* ignore */
    }
    renderTrigger();
    for (const row of aiModelList.children)
      row.classList.toggle("active", row.dataset.id === id);
    closeModelList();
  }
  function buildModelList() {
    aiModelList.innerHTML = "";
    for (const m of modelCatalog) {
      const cost = costInfo(m.pricing);
      const quality = qualityInfo(m.id);
      const row = document.createElement("button");
      row.type = "button";
      row.className = "ai-model-option";
      row.dataset.id = m.id;
      if (m.id === selectedModel) row.classList.add("active");

      const name = document.createElement("span");
      name.className = "ai-model-name";
      name.textContent = m.name;

      const tags = document.createElement("span");
      tags.className = "ai-model-tags";
      tags.append(
        badge(quality.label, "quality", quality.tier, "Quality (manual rating)"),
        badge(cost.text, "cost", cost.tier, "Output price per million tokens"),
      );

      row.append(name, tags);
      row.addEventListener("click", () => selectModel(m.id));
      aiModelList.append(row);
    }
  }
  function onDocClickModel(e) {
    if (!aiModelField.contains(e.target)) closeModelList();
  }
  aiModelTrigger.addEventListener("click", onModelTrigger);
  document.addEventListener("click", onDocClickModel);

  (async () => {
    let saved = null;
    try {
      saved = localStorage.getItem(OR_MODEL_STORE);
    } catch {
      /* ignore */
    }
    try {
      const models = await fetchImageModels();
      if (!models.length) return;
      modelCatalog = models;
      // Prefer the saved choice, then the config default, else the first model.
      const pick = [saved, AI_IMAGE.MODEL].find((id) =>
        models.some((m) => m.id === id),
      );
      selectedModel = pick ?? models[0].id;
      buildModelList();
      renderTrigger();
    } catch (err) {
      console.warn("Model list failed; using default model:", err.message);
      aiModelCurrent.textContent = selectedModel;
    }
  })();

  // --- Selection flow: orbit to frame, draw a box, generate from that crop ---
  const aiStartBtn = document.getElementById("ai-start");
  const aiSelect = document.getElementById("ai-select");
  const aiSelSurface = document.getElementById("ai-select-surface");
  const aiSelBox = document.getElementById("ai-select-box");
  const aiSelMsg = document.getElementById("ai-select-msg");
  const aiSelDraw = document.getElementById("ai-sel-draw");
  const aiSelGo = document.getElementById("ai-sel-go");
  const aiSelRedo = document.getElementById("ai-sel-redo");
  const aiSelBack = document.getElementById("ai-sel-back");
  const aiSelCancel = document.getElementById("ai-sel-cancel");

  // States: "off" | "orbit" (frame freely) | "draw" (drag a box) | "review".
  let selState = "off";
  let selRect = null;
  let dragStart = null;
  const SEL_MSG = {
    orbit: "Orbit and zoom to frame your home, then click “Draw box”.",
    draw: "Drag a box around your home.",
    review: "Generate from this selection, or redo the box.",
  };
  const show = (el, on) => el.classList.toggle("hidden", !on);

  function setSelState(s) {
    selState = s;
    aiSelMsg.textContent = SEL_MSG[s] ?? "";
    show(aiSelDraw, s === "orbit");
    show(aiSelGo, s === "review");
    show(aiSelRedo, s === "review");
    show(aiSelBack, s === "draw" || s === "review");
    show(aiSelCancel, s !== "off");
    // The drawing surface only intercepts the mouse while drawing/reviewing;
    // in orbit it stays click-through so OrbitControls drives the camera.
    aiSelSurface.style.pointerEvents =
      s === "draw" || s === "review" ? "auto" : "none";
    controls.enabled = s !== "draw" && s !== "review";
    if (s === "orbit" || s === "off") {
      aiSelBox.classList.add("hidden");
      selRect = null;
    }
  }

  function enterSelection() {
    if (!currentModel) return setAiStatus("Model is still loading…", true);
    closeAiModal();
    aiSelect.classList.remove("hidden");
    setSelState("orbit");
  }
  function exitSelection() {
    aiSelect.classList.add("hidden");
    setSelState("off");
  }

  function updateBox(r) {
    aiSelBox.style.left = `${r.x}px`;
    aiSelBox.style.top = `${r.y}px`;
    aiSelBox.style.width = `${r.width}px`;
    aiSelBox.style.height = `${r.height}px`;
  }
  function onSurfaceDown(e) {
    if (selState !== "draw" && selState !== "review") return;
    aiSelSurface.setPointerCapture(e.pointerId);
    dragStart = { x: e.clientX, y: e.clientY };
    selRect = { x: e.clientX, y: e.clientY, width: 0, height: 0 };
    updateBox(selRect);
    aiSelBox.classList.remove("hidden");
  }
  function onSurfaceMove(e) {
    if (!dragStart) return;
    selRect = {
      x: Math.min(dragStart.x, e.clientX),
      y: Math.min(dragStart.y, e.clientY),
      width: Math.abs(e.clientX - dragStart.x),
      height: Math.abs(e.clientY - dragStart.y),
    };
    updateBox(selRect);
  }
  function onSurfaceUp() {
    if (!dragStart) return;
    dragStart = null;
    if (selRect && selRect.width >= 8 && selRect.height >= 8)
      setSelState("review");
    else {
      aiSelBox.classList.add("hidden");
      selRect = null;
    }
  }
  aiSelSurface.addEventListener("pointerdown", onSurfaceDown);
  aiSelSurface.addEventListener("pointermove", onSurfaceMove);
  aiSelSurface.addEventListener("pointerup", onSurfaceUp);

  const onSelDraw = () => setSelState("draw");
  const onSelRedo = () => setSelState("draw");
  const onSelBack = () => setSelState("orbit");
  const onSelCancel = () => {
    exitSelection();
    openAiModal();
  };
  aiSelDraw.addEventListener("click", onSelDraw);
  aiSelRedo.addEventListener("click", onSelRedo);
  aiSelBack.addEventListener("click", onSelBack);
  aiSelCancel.addEventListener("click", onSelCancel);
  aiStartBtn.addEventListener("click", enterSelection);

  // --- Generation + tuning session: capture once, iterate prompts on it ------
  const aiRefine = document.getElementById("ai-refine");
  const aiRefImg = document.getElementById("ai-ref-img");
  const aiRefineInput = document.getElementById("ai-refine-input");
  const aiRegenBtn = document.getElementById("ai-regen");

  let generating = false;
  let currentReference = null; // captured view bound to the active tuning session
  let iterCount = 0;

  function onGenerateFromSelection() {
    if (generating) return;
    if (!selRect || selRect.width < 8 || selRect.height < 8) return;
    if (!readKey()) {
      exitSelection();
      openAiModal();
      return setAiStatus("Connect your OpenRouter account first.", true);
    }
    let reference;
    try {
      reference = captureView({
        renderer,
        scene,
        camera,
        model: currentModel,
        rect: selRect,
        fullWidth: window.innerWidth,
        fullHeight: window.innerHeight,
        maxSize: AI_IMAGE.CAPTURE_MAX,
        skyColor: AI_IMAGE.SKY_COLOR,
        groundColor: AI_IMAGE.GROUND_COLOR,
      });
    } catch (err) {
      exitSelection();
      openAiModal();
      return setAiStatus(`Capture failed: ${err.message}`, true);
    }
    exitSelection();
    openAiModal();

    // Begin a fresh tuning session bound to this captured view: all subsequent
    // regenerations reuse this reference, so the house stays consistent while
    // only the prompt changes.
    currentReference = reference;
    iterCount = 0;
    aiRefImg.src = reference;
    aiRefineInput.value = aiExtraInput.value.trim();
    aiRefine.classList.remove("hidden");
    aiResult.innerHTML = "";
    runGeneration(aiRefineInput.value);
  }
  function onRegenerate() {
    runGeneration(aiRefineInput.value);
  }
  aiSelGo.addEventListener("click", onGenerateFromSelection);
  aiRegenBtn.addEventListener("click", onRegenerate);

  function buildPrompt(extra) {
    const e = extra?.trim();
    return e
      ? `${AI_IMAGE.SYSTEM_PROMPT}\n\nAdditional direction: ${e}`
      : AI_IMAGE.SYSTEM_PROMPT;
  }

  // One attempt: image + the prompt note used + Download + Scrap. Newest first.
  function makeIteration(url, extra) {
    iterCount += 1;
    const n = iterCount;
    const card = document.createElement("figure");
    card.className = "ai-card ai-iteration";

    const bar = document.createElement("figcaption");
    bar.className = "ai-iter-bar";
    const cap = document.createElement("span");
    cap.className = "ai-caption";
    cap.textContent = extra?.trim() ? `#${n} · ${extra.trim()}` : `#${n} · base`;
    const scrap = document.createElement("button");
    scrap.type = "button";
    scrap.className = "ai-scrap";
    scrap.title = "Scrap this attempt";
    scrap.textContent = "✕";
    scrap.addEventListener("click", () => card.remove());
    bar.append(cap, scrap);

    const img = document.createElement("img");
    img.src = url;
    img.alt = `AI render #${n}`;

    const dl = document.createElement("a");
    dl.href = url;
    dl.download = `homeview-render-${n}.png`;
    dl.textContent = "Download";

    card.append(bar, img, dl);
    return card;
  }

  async function runGeneration(extra) {
    if (generating || !currentReference) return;
    const apiKey = readKey();
    if (!apiKey) {
      reflectConnection();
      return setAiStatus("Connect your OpenRouter account first.", true);
    }
    generating = true;
    aiRegenBtn.disabled = true;
    aiStartBtn.disabled = true;
    const spinner = document.createElement("div");
    spinner.className = "ai-spinner";
    aiResult.prepend(spinner);
    setAiStatus(`Generating${extra?.trim() ? " (refined)" : ""} — 15–60s…`);
    try {
      const url = await generateImage({
        apiKey,
        model: selectedModel || AI_IMAGE.MODEL,
        images: [currentReference],
        prompt: buildPrompt(extra),
      });
      spinner.replaceWith(makeIteration(url, extra));
      setAiStatus("Done. Tune the prompt and regenerate, or scrap attempts.");
    } catch (err) {
      spinner.remove();
      // A stale/invalid key (e.g. user revoked it) drops us back to connect.
      if (/session expired/i.test(err.message)) {
        try {
          localStorage.removeItem(OR_KEY_STORE);
        } catch {
          /* ignore */
        }
        reflectConnection();
      }
      setAiStatus(`Failed: ${err.message}`, true);
      console.error(err);
    } finally {
      generating = false;
      aiRegenBtn.disabled = false;
      aiStartBtn.disabled = false;
    }
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);

  // Position the key light relative to the current camera: over the viewer's
  // shoulder, raised and pushed to one side so visible faces stay lit while
  // still getting some directional shading (not a flat head-on flash).
  const _camRight = new THREE.Vector3();
  const _camUp = new THREE.Vector3();
  function updateKeyLight() {
    const dist = camera.position.distanceTo(controls.target) || 1;
    _camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    key.position
      .copy(camera.position)
      .addScaledVector(_camUp, dist * 0.6)
      .addScaledVector(_camRight, -dist * 0.35);
    key.target.position.copy(controls.target);
  }

  let rafId = 0;
  function tick() {
    controls.update();
    updateKeyLight();
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
    copyLinkBtn.removeEventListener("click", onCopyLink);
    aiOpenBtn.removeEventListener("click", openAiModal);
    aiCloseBtn.removeEventListener("click", closeAiModal);
    aiBackdrop.removeEventListener("click", closeAiModal);
    aiConnectBtn.removeEventListener("click", onConnect);
    aiDisconnectBtn.removeEventListener("click", onDisconnect);
    aiStartBtn.removeEventListener("click", enterSelection);
    aiSelDraw.removeEventListener("click", onSelDraw);
    aiSelRedo.removeEventListener("click", onSelRedo);
    aiSelBack.removeEventListener("click", onSelBack);
    aiSelCancel.removeEventListener("click", onSelCancel);
    aiSelGo.removeEventListener("click", onGenerateFromSelection);
    aiRegenBtn.removeEventListener("click", onRegenerate);
    aiModelTrigger.removeEventListener("click", onModelTrigger);
    document.removeEventListener("click", onDocClickModel);
    aiSelSurface.removeEventListener("pointerdown", onSurfaceDown);
    aiSelSurface.removeEventListener("pointermove", onSurfaceMove);
    aiSelSurface.removeEventListener("pointerup", onSurfaceUp);
    controls.dispose();
    pmrem.dispose();
    renderer.dispose();
  };
}
