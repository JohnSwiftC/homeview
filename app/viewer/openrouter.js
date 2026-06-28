const AUTH_URL = "https://openrouter.ai/auth";
const KEYS_URL = "https://openrouter.ai/api/v1/auth/keys";
const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const VERIFIER_STORE = "homeview.or_verifier";

function base64url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

export async function beginOAuth(callbackUrl) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = base64url(await sha256(verifier));
  sessionStorage.setItem(VERIFIER_STORE, verifier);
  const url =
    `${AUTH_URL}?callback_url=${encodeURIComponent(callbackUrl)}` +
    `&code_challenge=${challenge}&code_challenge_method=S256`;
  window.location.href = url;
}

export async function completeOAuth() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const verifier = sessionStorage.getItem(VERIFIER_STORE);
  if (!code || !verifier) return null;
  sessionStorage.removeItem(VERIFIER_STORE);

  try {
    const res = await fetch(KEYS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        code_challenge_method: "S256",
      }),
    });
    if (!res.ok) throw new Error(`Sign-in failed (HTTP ${res.status}).`);
    const data = await res.json();
    if (!data.key) throw new Error("OpenRouter returned no key.");
    return data.key;
  } finally {
    params.delete("code");
    const qs = params.toString();
    history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }
}

// Generate one image from the reference angles + prompt. `images` are PNG data
// URLs. Returns a data: URL for the generated image. Throws on failure.
export async function generateImage({ apiKey, model, images, prompt }) {
  const content = [{ type: "text", text: prompt }];
  for (const url of images)
    content.push({ type: "image_url", image_url: { url } });

  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      modalities: ["image", "text"],
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error?.message) detail = body.error.message;
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 401)
      detail = "Your OpenRouter session expired, reconnect.";
    if (res.status === 402)
      detail = "Out of OpenRouter credits, top up to generate.";
    throw new Error(detail);
  }

  const data = await res.json();
  const out = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!out) throw new Error("OpenRouter returned no image.");
  return out;
}
