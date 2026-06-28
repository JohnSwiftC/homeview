// Offscreen capture of the user-framed view for AI image generation.
//
// captureView() renders the current camera, cropped to a user-drawn selection
// box, into an offscreen target and returns a PNG data URL. A temporary ground
// plane + sky are added so the house sits in a plausible scene (not a void),
// which gives the image model real cues and sharply reduces hallucination.
// Renderer / scene / camera state is saved and restored, so the live view is
// untouched.
import * as THREE from "three";

// readRenderTargetPixels gives bottom-up RGBA; copy into a top-down 2D canvas.
function pixelsToCanvas(buffer, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(width, height);
  const row = width * 4;
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * row;
    image.data.set(buffer.subarray(src, src + row), y * row);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// Capture the current `camera` view cropped to `rect` — a sub-rectangle of the
// fullWidth x fullHeight viewport, in the same CSS-pixel coordinates as the
// on-screen selection box. setViewOffset renders exactly that sub-rectangle of
// the live frustum, so the result matches what's inside the box on screen.
// Returns a PNG data URL whose longest edge is <= maxSize.
export function captureView({
  renderer,
  scene,
  camera,
  model,
  rect,
  fullWidth,
  fullHeight,
  maxSize = 1280,
  skyColor,
  groundColor,
}) {
  if (!model) throw new Error("No model loaded yet.");
  if (!rect || rect.width < 2 || rect.height < 2)
    throw new Error("Selection is too small.");

  const box = new THREE.Box3().setFromObject(model);
  const sphere = box.getBoundingSphere(new THREE.Sphere());

  // Output keeps the box aspect, capped to maxSize on the long edge.
  const scale = Math.min(1, maxSize / Math.max(rect.width, rect.height));
  const outW = Math.max(1, Math.round(rect.width * scale));
  const outH = Math.max(1, Math.round(rect.height * scale));

  const rt = new THREE.WebGLRenderTarget(outW, outH);
  rt.texture.colorSpace = THREE.SRGBColorSpace;

  const prevTarget = renderer.getRenderTarget();
  const prevBg = scene.background;
  const prevFar = camera.far;

  let ground = null;
  if (groundColor != null) {
    const span = sphere.radius * 60;
    ground = new THREE.Mesh(
      new THREE.PlaneGeometry(span, span),
      new THREE.MeshStandardMaterial({ color: groundColor, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    // Just under the model's base to avoid z-fighting at the seam.
    ground.position.set(
      sphere.center.x,
      box.min.y - sphere.radius * 0.002,
      sphere.center.z,
    );
    scene.add(ground);
  }
  if (skyColor != null) scene.background = new THREE.Color(skyColor);

  // Extend far so the large ground plane stays inside the frustum.
  camera.far = Math.max(
    prevFar,
    camera.position.distanceTo(sphere.center) + sphere.radius * 80,
  );
  camera.setViewOffset(fullWidth, fullHeight, rect.x, rect.y, rect.width, rect.height);
  camera.updateProjectionMatrix();

  let url;
  try {
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    const buffer = new Uint8Array(outW * outH * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, outW, outH, buffer);
    url = pixelsToCanvas(buffer, outW, outH).toDataURL("image/png");
  } finally {
    camera.clearViewOffset();
    camera.far = prevFar;
    camera.updateProjectionMatrix();
    renderer.setRenderTarget(prevTarget);
    scene.background = prevBg;
    if (ground) {
      scene.remove(ground);
      ground.geometry.dispose();
      ground.material.dispose();
    }
    rt.dispose();
  }
  return url;
}
