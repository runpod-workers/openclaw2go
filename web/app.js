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

  useEffect(() => {
    fetch("/config.json")
      .then((res) => res.json())
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

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
            placeholder: "LLAMA_API_KEY",
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
        { className: "grid" },
        React.createElement(
          "p",
          { className: "muted" },
          "Audio uses streaming responses. For now, use CLI or curl with the proxy endpoints.",
        ),
        React.createElement(
          "pre",
          null,
          `openclaw-tts "Hello world" --output /workspace/openclaw/audio/hello.wav\n` +
            `openclaw-stt /path/to/audio.wav\n\n` +
            `curl -s ${window.location.origin}/api/audio/v1/chat/completions -H "Content-Type: application/json" -d '{\"model\":\"\",\"messages\":[{\"role\":\"system\",\"content\":\"Perform TTS. Use the US male voice.\"},{\"role\":\"user\",\"content\":\"Hello\"}],\"stream\":true}'`,
        ),
      ),
    }),
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));
