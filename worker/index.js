// ============================================================
// Bono Cultural — Worker proxy para Gemini API
// Oculta las API keys, rota entre 10 keys (round-robin via KV)
// y hace failover automatico si una key esta agotada.
// ============================================================

const ALLOWED_ORIGIN = "https://optimizador-bono-cultural.lopezmorante08.workers.dev";
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const NUM_KEYS = 10;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function collectKeys(env) {
  const keys = [];
  for (let i = 1; i <= NUM_KEYS; i++) {
    const k = env["GEMINI_KEY_" + i];
    if (k) keys.push(k);
  }
  return keys;
}

async function verifyTurnstile(token, env, ip) {
  if (!token || typeof token !== "string") return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);

  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body: form });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

async function nextStartIndex(env, keyCount) {
  let counter = parseInt(await env.KEY_ROTATION.get("counter"), 10);
  if (isNaN(counter)) counter = 0;
  await env.KEY_ROTATION.put("counter", String(counter + 1));
  return counter % keyCount;
}

async function callGeminiWithFailover(keys, startIndex, prompt, systemPrompt) {
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt || "" }] },
    tools: [{ google_search: {} }],
    generationConfig: { maxOutputTokens: 3000 },
  };

  let lastError = "Error desconocido";

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const key = keys[(startIndex + attempt) % keys.length];

    let res;
    try {
      res = await fetch(`${GEMINI_URL}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastError = "Fallo de red al llamar a Gemini: " + (err.message || String(err));
      continue;
    }

    if (res.status === 429 || res.status === 403) {
      lastError = "Key agotada o sin cuota (HTTP " + res.status + ")";
      continue;
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      lastError = "Error Gemini (HTTP " + res.status + "): " + txt.slice(0, 300);
      continue;
    }

    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts || [])
      .filter((p) => p.text)
      .map((p) => p.text)
      .join("");

    return { ok: true, text };
  }

  return { ok: false, error: lastError };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/api/chat" || request.method !== "POST") {
      return jsonResponse({ error: "not_found" }, 404);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400);
    }

    const { prompt, systemPrompt, turnstileToken } = body || {};
    if (!prompt || typeof prompt !== "string") {
      return jsonResponse({ error: "missing_prompt" }, 400);
    }

    const humanVerified = await verifyTurnstile(turnstileToken, env, request.headers.get("CF-Connecting-IP"));
    if (!humanVerified) {
      return jsonResponse({ error: "human_verification_failed" }, 403);
    }

    const keys = collectKeys(env);
    if (keys.length === 0) {
      return jsonResponse({ error: "no_api_keys_configured" }, 500);
    }

    const startIndex = await nextStartIndex(env, keys.length);
    const result = await callGeminiWithFailover(keys, startIndex, prompt, systemPrompt);

    if (!result.ok) {
      return jsonResponse({ error: "all_keys_failed", detail: result.error }, 502);
    }

    return jsonResponse({ text: result.text });
  },
};
