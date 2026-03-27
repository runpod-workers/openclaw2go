"use strict";

const h = React.createElement;
const { useState, useEffect, useRef, useCallback } = React;

// ── Helpers ──

function cls(...parts) {
  return parts.filter(Boolean).join(" ");
}

function fmtCtx(n) {
  if (!n) return "—";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function fmtVram(mb) {
  if (!mb) return "—";
  if (mb >= 1000) return `${Math.round(mb / 1024)}GB`;
  return `${mb}MB`;
}

const SERVICE_COLORS = {
  llm: "#00e5ff",
  image: "#ec407a",
  audio: "#b388ff",
};

// The 3 UI categories — vision rolls into llm, tts rolls into audio
const UI_ROLES = ["llm", "image", "audio"];

const ROLE_LABELS = {
  llm: "LLM",
  image: "Image",
  audio: "Audio",
};

// Example models for unconfigured hints
const ROLE_EXAMPLES = {
  image: "disty0/flux2-klein-sdnq",
  audio: "liquidai/lfm25-audio",
};

// ── Shared components ──

function StatusDot({ status }) {
  const st = !status ? "loading" : status.ok ? "ok" : "err";
  return h("span", { className: cls("status-dot", st) });
}

function ServiceHeader({ role, modelName, health, color }) {
  return h("div", { className: "service-header" },
    h("span", { className: "service-dot", style: { background: color } }),
    h("span", { className: "service-name" }, ROLE_LABELS[role] || role),
    modelName ? h("span", { className: "service-model" }, `— ${modelName}`) : null,
    h("span", { className: "service-spacer" }),
    h(StatusDot, { status: health }),
  );
}

// ── Header ──

function Header({ profile }) {
  const profileText = profile ? `${profile.name || profile.id}` : "";
  return h("div", { className: "header" },
    h("div", { className: "header-brand" },
      h("a", { href: "https://github.com/runpod-labs/a2go", target: "_blank", rel: "noopener" },
        h("img", { src: "/a2go_logo_nobg.png", alt: "agent2go", className: "header-logo" }),
      ),
      h("span", { className: "header-title" }, "agent2go"),
    ),
    profileText ? h("span", { className: "header-meta" }, `profile: ${profileText}`) : null,
  );
}

// ── System card ──

function SystemCard({ gpu, profile }) {
  const gpuName = gpu?.name || "Unknown GPU";
  const vramTotal = gpu?.vramMb || 0;
  const vramUsed = profile?.vramTotal || 0;
  const pct = vramTotal > 0 ? Math.min(100, Math.round((vramUsed / vramTotal) * 100)) : 0;

  return h("div", null,
    h("div", { className: "section-label" }, "SYSTEM"),
    h("div", { className: "card fade-in" },
      h("div", { className: "system-row" },
        h("span", { className: "system-label" }, "GPU"),
        h("span", { className: "system-value" }, `${gpuName} — ${fmtVram(vramTotal)} VRAM`),
      ),
      h("div", { className: "system-row", style: { marginTop: 10 } },
        h("span", { className: "system-label" }, "VRAM"),
        h("span", { className: "system-value" }, `~${fmtVram(vramUsed)} / ${fmtVram(vramTotal)}`),
        h("div", { className: "vram-bar-track" },
          h("div", { className: "vram-bar-fill", style: { width: `${pct}%` } }),
        ),
      ),
    ),
  );
}

// ── LLM Section ──

function LlmSection({ svc, health, config }) {
  const [prompt, setPrompt] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const model = svc?.servedAs || svc?.modelName || "llm";

  const send = async () => {
    setError("");
    setOutput("");
    setLoading(true);
    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey.trim()) headers["Authorization"] = `Bearer ${apiKey.trim()}`;
      const res = await fetch("/api/llm/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          stream: false,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `Request failed (${res.status})`);
      setOutput(data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "No response.");
    } catch (err) {
      setError(err.message || "LLM request failed.");
    } finally {
      setLoading(false);
    }
  };

  return h("div", { className: "card fade-in" },
    h(ServiceHeader, { role: "llm", modelName: svc?.servedAs || svc?.modelName, health, color: SERVICE_COLORS.llm }),

    h("div", { className: "service-meta" },
      svc?.contextLength ? h("span", { className: "meta-item" }, "Context: ", h("span", { className: "meta-value" }, `${fmtCtx(svc.contextLength)} tokens`)) : null,
      svc?.hasVision ? h("span", { className: "meta-item" }, "Vision: ", h("span", { className: "meta-value" }, "yes")) : null,
    ),

    h("div", { className: "field" },
      h("label", null, "Prompt"),
      h("textarea", {
        value: prompt,
        onChange: e => setPrompt(e.target.value),
        placeholder: "Ask the model something...",
        onKeyDown: e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && prompt.trim() && !loading) send(); },
      }),
    ),

    h("div", { className: "form-row" },
      h("div", { style: { flex: 1 } },
        h("label", null, "API Key"),
        h("input", {
          type: "password",
          value: apiKey,
          onChange: e => setApiKey(e.target.value),
          placeholder: "Bearer token",
        }),
      ),
      h("div", { style: { flex: "0 0 auto", alignSelf: "flex-end" } },
        h("button", { onClick: send, disabled: loading || !prompt.trim() },
          loading ? "SENDING..." : "SEND"),
      ),
    ),

    error ? h("div", { className: "error-text", style: { marginBottom: 8 } }, error) : null,
    output ? h("div", null,
      h("label", null, "Response"),
      h("pre", null, output),
    ) : null,
  );
}

// ── Image Section ──

function ImageSection({ svc, health }) {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [seed, setSeed] = useState("0");
  const [steps, setSteps] = useState("4");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const payload = {
        prompt,
        steps: steps ? Number(steps) : 4,
        seed: seed ? Number(seed) : 0,
      };
      if (aspect.trim()) payload.aspect = aspect.trim();
      else {
        if (width) payload.width = Number(width);
        if (height) payload.height = Number(height);
      }
      const res = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data?.error || `Request failed (${res.status})`);
      let url = data.image_public_url || data.image_proxy_url || data.image_local_url || data.image_url || "";
      if (url.startsWith("/")) url = `${window.location.origin}${url}`;
      setResult({ url, name: data.image_name, width: data.width, height: data.height });
    } catch (err) {
      setError(err.message || "Image request failed.");
    } finally {
      setLoading(false);
    }
  };

  return h("div", { className: "card fade-in" },
    h(ServiceHeader, { role: "image", modelName: svc?.servedAs || svc?.modelName, health, color: SERVICE_COLORS.image }),

    h("div", { className: "field" },
      h("label", null, "Prompt"),
      h("textarea", {
        value: prompt,
        onChange: e => setPrompt(e.target.value),
        placeholder: "A friendly robot on a desk, photorealistic...",
      }),
    ),

    h("div", { className: "form-row" },
      h("div", null,
        h("label", null, "Aspect"),
        h("input", { type: "text", value: aspect, onChange: e => setAspect(e.target.value), placeholder: "1:1" }),
      ),
      h("div", null,
        h("label", null, "Width"),
        h("input", { type: "text", value: width, onChange: e => setWidth(e.target.value), placeholder: "1024" }),
      ),
      h("div", null,
        h("label", null, "Height"),
        h("input", { type: "text", value: height, onChange: e => setHeight(e.target.value), placeholder: "1024" }),
      ),
    ),

    h("div", { className: "form-row" },
      h("div", null,
        h("label", null, "Steps"),
        h("input", { type: "text", value: steps, onChange: e => setSteps(e.target.value), placeholder: "4" }),
      ),
      h("div", null,
        h("label", null, "Seed"),
        h("input", { type: "text", value: seed, onChange: e => setSeed(e.target.value), placeholder: "0" }),
      ),
      h("div", { style: { alignSelf: "flex-end" } },
        h("button", { onClick: generate, disabled: loading || !prompt.trim() },
          loading ? "GENERATING..." : "GENERATE"),
      ),
    ),

    error ? h("div", { className: "error-text", style: { marginBottom: 8 } }, error) : null,
    result ? h("div", null,
      h("div", { className: "meta-item", style: { marginBottom: 4 } },
        `${result.name || "image"} — ${result.width}x${result.height}`),
      h("div", { className: "meta-item" },
        h("a", { href: result.url, target: "_blank", style: { color: SERVICE_COLORS.image } }, result.url)),
      result.url ? h("img", { className: "preview", src: result.url }) : null,
    ) : null,
  );
}

// ── Audio Section ──

function AudioSection({ svc, health }) {
  // TTS state
  const [ttsText, setTtsText] = useState("");
  const [ttsVoice, setTtsVoice] = useState("US male");
  const [ttsUrl, setTtsUrl] = useState("");
  const [ttsError, setTtsError] = useState("");
  const [ttsLoading, setTtsLoading] = useState(false);

  // STT state
  const [sttFile, setSttFile] = useState(null);
  const [sttText, setSttText] = useState("");
  const [sttError, setSttError] = useState("");
  const [sttLoading, setSttLoading] = useState(false);

  useEffect(() => {
    return () => { if (ttsUrl) URL.revokeObjectURL(ttsUrl); };
  }, [ttsUrl]);

  const runTts = async () => {
    setTtsError("");
    setTtsUrl("");
    setTtsLoading(true);
    try {
      const res = await fetch("/api/audio/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ttsText, voice: ttsVoice }),
      });
      if (!res.ok) throw new Error(await res.text() || `Request failed (${res.status})`);
      const blob = await res.blob();
      setTtsUrl(URL.createObjectURL(blob));
    } catch (err) {
      setTtsError(err.message || "TTS failed.");
    } finally {
      setTtsLoading(false);
    }
  };

  const readFileAsDataUrl = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });

  const runStt = async () => {
    setSttError("");
    setSttText("");
    setSttLoading(true);
    try {
      if (!sttFile) throw new Error("Select a WAV file first.");
      const dataUrl = await readFileAsDataUrl(sttFile);
      const res = await fetch("/api/audio/stt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: dataUrl, format: "wav" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data?.error || `Request failed (${res.status})`);
      setSttText(data.text || "");
    } catch (err) {
      setSttError(err.message || "STT failed.");
    } finally {
      setSttLoading(false);
    }
  };

  return h("div", { className: "card fade-in" },
    h(ServiceHeader, { role: "audio", modelName: svc?.servedAs || svc?.modelName, health, color: SERVICE_COLORS.audio }),

    // TTS
    h("div", { style: { marginBottom: 20 } },
      h("div", { className: "field" },
        h("label", null, "Text to Speech"),
        h("textarea", {
          value: ttsText,
          onChange: e => setTtsText(e.target.value),
          placeholder: "Type text to synthesize...",
        }),
      ),
      h("div", { className: "form-row" },
        h("div", null,
          h("label", null, "Voice"),
          h("select", { value: ttsVoice, onChange: e => setTtsVoice(e.target.value) },
            h("option", { value: "US male" }, "US male"),
            h("option", { value: "UK male" }, "UK male"),
            h("option", { value: "US female" }, "US female"),
            h("option", { value: "UK female" }, "UK female"),
          ),
        ),
        h("div", { style: { alignSelf: "flex-end" } },
          h("button", { onClick: runTts, disabled: ttsLoading || !ttsText.trim() },
            ttsLoading ? "GENERATING..." : "GENERATE SPEECH"),
        ),
      ),
      ttsError ? h("div", { className: "error-text" }, ttsError) : null,
      ttsUrl ? h("div", { style: { marginTop: 8 } },
        h("audio", { controls: true, src: ttsUrl }),
        h("div", { style: { marginTop: 4 } },
          h("a", { href: ttsUrl, download: "tts.wav", style: { fontFamily: "var(--font-mono)", fontSize: 11, color: SERVICE_COLORS.audio } }, "Download WAV"),
        ),
      ) : null,
    ),

    // STT
    h("div", null,
      h("div", { className: "field" },
        h("label", null, "Speech to Text"),
        h("input", {
          type: "file",
          accept: "audio/wav",
          onChange: e => setSttFile(e.target.files?.[0] || null),
        }),
      ),
      h("div", { className: "row" },
        h("button", { onClick: runStt, disabled: sttLoading || !sttFile },
          sttLoading ? "TRANSCRIBING..." : "TRANSCRIBE"),
        sttError ? h("span", { className: "error-text" }, sttError) : null,
      ),
      sttText ? h("div", { style: { marginTop: 12 } },
        h("label", null, "Transcript"),
        h("pre", null, sttText),
      ) : null,
    ),
  );
}

// ── Not Configured Section ──

function NotConfiguredSection({ services, currentLlm }) {
  const unconfigured = UI_ROLES.filter(role => !services?.[role]?.configured);
  if (unconfigured.length === 0) return null;

  const llmSlug = currentLlm || "unsloth/glm47-flash-gguf";

  return h("div", { style: { marginTop: 8 } },
    h("div", { className: "section-label" }, "NOT CONFIGURED"),
    h("div", { className: "card fade-in" },
      unconfigured.map(role => {
        const example = ROLE_EXAMPLES[role];
        if (!example) return null;

        const configJson = JSON.stringify({ llm: llmSlug, [role]: example }, null, 2);

        return h("div", { key: role, className: "unconfigured-item" },
          h("div", { className: "unconfigured-role" }, ROLE_LABELS[role]),
          h("div", { className: "unconfigured-hint" },
            "Select a model on ",
            h("a", { href: "https://a2go.run", target: "_blank", rel: "noopener", style: { color: "var(--primary)" } }, "a2go.run"),
            " or set ",
            h("code", null, "A2GO_CONFIG"),
            " on your pod:",
          ),
          h("pre", { className: "unconfigured-example" }, configJson),
        );
      }),
    ),
  );
}

// ── App ──

function App() {
  const [config, setConfig] = useState(null);
  const [health, setHealth] = useState({});

  // Fetch config once
  useEffect(() => {
    fetch("/config.json")
      .then(r => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  // Health polling
  const refreshHealth = useCallback(() => {
    fetch("/health")
      .then(r => r.json())
      .then(setHealth)
      .catch(() => setHealth({}));
  }, []);

  useEffect(() => {
    refreshHealth();
    const interval = setInterval(refreshHealth, 30000);
    return () => clearInterval(interval);
  }, [refreshHealth]);

  const services = config?.services || {};
  const currentLlm = services.llm?.servedAs || services.llm?.modelName || "";

  return h("div", { className: "container" },
    h(Header, { profile: config?.profile }),

    // System
    (config?.gpu || config?.profile)
      ? h(SystemCard, { gpu: config.gpu, profile: config.profile })
      : null,

    // Configured services (only the 3 UI categories)
    UI_ROLES.map(role => {
      const svc = services[role];
      if (!svc?.configured) return null;
      const svcHealth = health[role];
      if (role === "llm") return h(LlmSection, { key: role, svc, health: svcHealth, config });
      if (role === "image") return h(ImageSection, { key: role, svc, health: svcHealth });
      if (role === "audio") return h(AudioSection, { key: role, svc, health: svcHealth });
      return null;
    }),

    // Not configured
    h(NotConfiguredSection, { services, currentLlm }),
  );
}

// ── Mount ──

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(h(App));
