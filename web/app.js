const { useEffect, useState } = React;

function Pill({ label, status }) {
  const className = status === "ok" ? "pill ok" : status === "warn" ? "pill warn" : "pill err";
  return React.createElement("span", { className }, label);
}

function Section({ title, children }) {
  return React.createElement(
    "section",
    { className: "card" },
    React.createElement("h2", null, title),
    children,
  );
}

function App() {
  const [config, setConfig] = useState(null);
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState("");

  const [llmPrompt, setLlmPrompt] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmOutput, setLlmOutput] = useState("");
  const [llmError, setLlmError] = useState("");
  const [llmLoading, setLlmLoading] = useState(false);

  const [imgPrompt, setImgPrompt] = useState("");
  const [imgAspect, setImgAspect] = useState("");
  const [imgWidth, setImgWidth] = useState("");
  const [imgHeight, setImgHeight] = useState("");
  const [imgSeed, setImgSeed] = useState("0");
  const [imgSteps, setImgSteps] = useState("4");
  const [imgResult, setImgResult] = useState(null);
  const [imgError, setImgError] = useState("");
  const [imgLoading, setImgLoading] = useState(false);
  const [ttsText, setTtsText] = useState("");
  const [ttsVoice, setTtsVoice] = useState("US male");
  const [ttsAudioUrl, setTtsAudioUrl] = useState("");
  const [ttsError, setTtsError] = useState("");
  const [ttsLoading, setTtsLoading] = useState(false);
  const [sttFile, setSttFile] = useState(null);
  const [sttText, setSttText] = useState("");
  const [sttError, setSttError] = useState("");
  const [sttLoading, setSttLoading] = useState(false);

  useEffect(() => {
    fetch("/config.json")
      .then((res) => res.json())
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    return () => {
      if (ttsAudioUrl) {
        URL.revokeObjectURL(ttsAudioUrl);
      }
    };
  }, [ttsAudioUrl]);

  const refreshHealth = () => {
    setHealthError("");
    fetch("/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => {
        setHealth(null);
        setHealthError("Health check failed.");
      });
  };

  useEffect(() => {
    refreshHealth();
  }, []);

  const runLlm = async () => {
    setLlmError("");
    setLlmOutput("");
    setLlmLoading(true);
    try {
      const model = config?.llmModel || "glm-4.7-flash";
      const payload = {
        model,
        stream: false,
        messages: [{ role: "user", content: llmPrompt }],
      };
      const headers = { "Content-Type": "application/json" };
      if (llmApiKey.trim()) {
        headers.Authorization = `Bearer ${llmApiKey.trim()}`;
      }
      const res = await fetch("/api/llm/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message || `Request failed (${res.status})`);
      }
      const content =
        data?.choices?.[0]?.message?.content ||
        data?.choices?.[0]?.text ||
        "No response content.";
      setLlmOutput(content);
    } catch (err) {
      setLlmError(err.message || "LLM request failed.");
    } finally {
      setLlmLoading(false);
    }
  };

  const runImage = async () => {
    setImgError("");
    setImgResult(null);
    setImgLoading(true);
    try {
      const payload = {
        prompt: imgPrompt,
        steps: imgSteps ? Number(imgSteps) : 4,
        seed: imgSeed ? Number(imgSeed) : 0,
      };
      if (imgAspect.trim()) {
        payload.aspect = imgAspect.trim();
      } else {
        if (imgWidth) payload.width = Number(imgWidth);
        if (imgHeight) payload.height = Number(imgHeight);
      }
      const res = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      let url =
        data.image_public_url ||
        data.image_proxy_url ||
        data.image_local_url ||
        data.image_url ||
        "";
      if (url.startsWith("/")) {
        url = `${window.location.origin}${url}`;
      }
      setImgResult({
        url,
        name: data.image_name,
        width: data.width,
        height: data.height,
      });
    } catch (err) {
      setImgError(err.message || "Image request failed.");
    } finally {
      setImgLoading(false);
    }
  };

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsDataURL(file);
    });

  const runTts = async () => {
    setTtsError("");
    setTtsAudioUrl("");
    setTtsLoading(true);
    try {
      const res = await fetch("/api/audio/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ttsText, voice: ttsVoice }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setTtsAudioUrl(url);
    } catch (err) {
      setTtsError(err.message || "TTS request failed.");
    } finally {
      setTtsLoading(false);
    }
  };

  const runStt = async () => {
    setSttError("");
    setSttText("");
    setSttLoading(true);
    try {
      if (!sttFile) {
        throw new Error("Select a WAV file first.");
      }
      const dataUrl = await readFileAsDataUrl(sttFile);
      const res = await fetch("/api/audio/stt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: dataUrl, format: "wav" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      setSttText(data.text || "");
    } catch (err) {
      setSttError(err.message || "STT request failed.");
    } finally {
      setSttLoading(false);
    }
  };

  const healthPill = (key, label) => {
    if (!health || !health[key]) {
      return React.createElement(Pill, { label: `${label}: unknown`, status: "warn" });
    }
    const status = health[key].ok ? "ok" : "err";
    const text = `${label}: ${health[key].status || "error"}`;
    return React.createElement(Pill, { label: text, status });
  };

  return React.createElement(
    "div",
    { className: "container" },
    React.createElement("h1", { className: "title" }, "OpenClaw Media Proxy"),
    React.createElement(
      "p",
      { className: "subtitle" },
      "Single endpoint for LLM, audio, and image services.",
    ),

    Section({
      title: "Status",
      children: React.createElement(
        "div",
        { className: "grid two" },
        React.createElement(
          "div",
          null,
          React.createElement("div", { className: "row" }, [
            healthPill("llm", "llm"),
            healthPill("audio", "audio"),
            healthPill("image", "image"),
          ]),
          healthError ? React.createElement("div", { className: "error" }, healthError) : null,
          React.createElement(
            "div",
            { className: "row", style: { marginTop: "12px" } },
            React.createElement("button", { onClick: refreshHealth }, "Refresh"),
          ),
        ),
        React.createElement(
          "div",
          null,
          React.createElement(
            "div",
            { className: "muted" },
            "Public image base: ",
            config?.imagePublicBaseUrl || "not set",
          ),
          React.createElement(
            "div",
            { className: "muted", style: { marginTop: "6px" } },
            "LLM model: ",
            config?.llmModel || "glm-4.7-flash",
          ),
        ),
      ),
    }),

    Section({
      title: "LLM (glm-4.7-flash)",
      children: React.createElement(
        "div",
        { className: "grid" },
        React.createElement(
          "div",
          null,
          React.createElement("label", null, "Prompt"),
          React.createElement("textarea", {
            value: llmPrompt,
            onChange: (e) => setLlmPrompt(e.target.value),
            placeholder: "Ask the model something...",
          }),
        ),
        React.createElement(
          "div",
          null,
          React.createElement("label", null, "API key (Bearer)"),
          React.createElement("input", {
            value: llmApiKey,
            onChange: (e) => setLlmApiKey(e.target.value),
            placeholder: "LLAMACPP_API_KEY",
            type: "password",
          }),
          React.createElement(
            "div",
            { className: "muted" },
            "Default is often 'changeme' unless you set it.",
          ),
        ),
        React.createElement(
          "div",
          { className: "row" },
          React.createElement(
            "button",
            { onClick: runLlm, disabled: llmLoading || !llmPrompt.trim() },
            llmLoading ? "Running..." : "Send",
          ),
          llmError ? React.createElement("span", { className: "error" }, llmError) : null,
        ),
        llmOutput
          ? React.createElement(
              "div",
              null,
              React.createElement("label", null, "Response"),
              React.createElement("pre", null, llmOutput),
            )
          : null,
      ),
    }),

    Section({
      title: "Image (FLUX.2 Klein)",
      children: React.createElement(
        "div",
        { className: "grid" },
        React.createElement(
          "div",
          null,
          React.createElement("label", null, "Prompt"),
          React.createElement("textarea", {
            value: imgPrompt,
            onChange: (e) => setImgPrompt(e.target.value),
            placeholder: "A friendly robot on a desk, photorealistic...",
          }),
        ),
        React.createElement(
          "div",
          { className: "grid two" },
          React.createElement(
            "div",
            null,
            React.createElement("label", null, "Aspect ratio (optional)"),
            React.createElement("input", {
              value: imgAspect,
              onChange: (e) => setImgAspect(e.target.value),
              placeholder: "1:1 or 16:9",
            }),
          ),
          React.createElement(
            "div",
            null,
            React.createElement("label", null, "Steps / Seed"),
            React.createElement(
              "div",
              { className: "row" },
              React.createElement("input", {
                value: imgSteps,
                onChange: (e) => setImgSteps(e.target.value),
                placeholder: "4",
              }),
              React.createElement("input", {
                value: imgSeed,
                onChange: (e) => setImgSeed(e.target.value),
                placeholder: "0",
              }),
            ),
          ),
          React.createElement(
            "div",
            null,
            React.createElement("label", null, "Width (optional)"),
            React.createElement("input", {
              value: imgWidth,
              onChange: (e) => setImgWidth(e.target.value),
              placeholder: "1024",
            }),
          ),
          React.createElement(
            "div",
            null,
            React.createElement("label", null, "Height (optional)"),
            React.createElement("input", {
              value: imgHeight,
              onChange: (e) => setImgHeight(e.target.value),
              placeholder: "1024",
            }),
          ),
        ),
        React.createElement(
          "div",
          { className: "row" },
          React.createElement(
            "button",
            { onClick: runImage, disabled: imgLoading || !imgPrompt.trim() },
            imgLoading ? "Generating..." : "Generate",
          ),
          imgError ? React.createElement("span", { className: "error" }, imgError) : null,
        ),
        imgResult
          ? React.createElement(
              "div",
              null,
              React.createElement(
                "div",
                { className: "muted" },
                `Saved as ${imgResult.name || "image"}. ${imgResult.width}x${imgResult.height}`,
              ),
              React.createElement(
                "div",
                { className: "muted" },
                "URL: ",
                React.createElement("a", { href: imgResult.url, target: "_blank" }, imgResult.url),
              ),
              imgResult.url
                ? React.createElement("img", { className: "preview", src: imgResult.url })
                : null,
            )
          : null,
      ),
    }),

    Section({
      title: "Audio (LFM2.5)",
      children: React.createElement(
        "div",
        { className: "grid two" },
        React.createElement(
          "div",
          null,
          React.createElement("label", null, "Text to speech"),
          React.createElement("textarea", {
            value: ttsText,
            onChange: (e) => setTtsText(e.target.value),
            placeholder: "Type text to synthesize...",
          }),
          React.createElement("label", null, "Voice"),
          React.createElement(
            "select",
            { value: ttsVoice, onChange: (e) => setTtsVoice(e.target.value) },
            React.createElement("option", { value: "US male" }, "US male"),
            React.createElement("option", { value: "UK male" }, "UK male"),
            React.createElement("option", { value: "US female" }, "US female"),
            React.createElement("option", { value: "UK female" }, "UK female"),
          ),
          React.createElement(
            "div",
            { className: "row", style: { marginTop: "12px" } },
            React.createElement(
              "button",
              { onClick: runTts, disabled: ttsLoading || !ttsText.trim() },
              ttsLoading ? "Generating..." : "Generate speech",
            ),
            ttsError ? React.createElement("span", { className: "error" }, ttsError) : null,
          ),
          ttsAudioUrl
            ? React.createElement(
                "div",
                { style: { marginTop: "12px" } },
                React.createElement("audio", {
                  controls: true,
                  src: ttsAudioUrl,
                  style: { width: "100%" },
                }),
                React.createElement(
                  "div",
                  { className: "muted", style: { marginTop: "6px" } },
                  React.createElement("a", { href: ttsAudioUrl, download: "tts.wav" }, "Download"),
                ),
              )
            : null,
        ),
        React.createElement(
          "div",
          null,
          React.createElement("label", null, "Speech to text (WAV)"),
          React.createElement("input", {
            type: "file",
            accept: "audio/wav",
            onChange: (e) => setSttFile(e.target.files?.[0] || null),
          }),
          React.createElement(
            "div",
            { className: "muted" },
            "Upload a WAV file to transcribe.",
          ),
          React.createElement(
            "div",
            { className: "row", style: { marginTop: "12px" } },
            React.createElement(
              "button",
              { onClick: runStt, disabled: sttLoading || !sttFile },
              sttLoading ? "Transcribing..." : "Transcribe",
            ),
            sttError ? React.createElement("span", { className: "error" }, sttError) : null,
          ),
          sttText
            ? React.createElement(
                "div",
                { style: { marginTop: "12px" } },
                React.createElement("label", null, "Transcript"),
                React.createElement("pre", null, sttText),
              )
            : null,
        ),
      ),
    }),
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));
