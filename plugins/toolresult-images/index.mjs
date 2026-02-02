const IMAGE_EXT_RE = /\.(png|jpg|jpeg|webp|gif)$/i;
const IMAGE_PATH_RE = /\/(images\/[^"'\\s<>]+|latest)\b/i;
const WORKSPACE_IMAGE_RE = /\/workspace\/openclaw\/images\/([^\s"'<>]+)/i;
const IMAGE_JSON_RE =
  /"(image_public_url|image_proxy_url|image_local_url|image_url)"\s*:\s*"([^"]+)"/i;
const IMAGE_PATH_JSON_RE = /"image_path"\s*:\s*"([^"]+)"/i;
const WORKSPACE_AUDIO_RE = /\/workspace\/openclaw\/audio\/([^\s"'<>]+)/i;
const AUDIO_JSON_RE = /"(audio_url|audio_link)"\s*:\s*"([^"]+)"/i;
const AUDIO_PATH_JSON_RE = /"audio_path"\s*:\s*"([^"]+)"/i;

function trimUrl(value) {
  return value.replace(/[)\].,;]+$/, "");
}

function resolveBaseUrl() {
  const envBase = process.env.OPENCLAW_IMAGE_PUBLIC_BASE_URL;
  if (envBase && envBase.trim()) {
    return envBase.trim().replace(/\/+$/, "");
  }
  const podId = process.env.RUNPOD_POD_ID;
  if (podId && podId.trim()) {
    const port = process.env.OPENCLAW_WEB_PROXY_PORT || "8080";
    return `https://${podId.trim()}-${port}.proxy.runpod.net`;
  }
  return "";
}

function extractImageUrl(text) {
  if (!text || typeof text !== "string") {
    return "";
  }

  const jsonMatch = text.match(IMAGE_JSON_RE);
  if (jsonMatch && jsonMatch[2]) {
    return trimUrl(jsonMatch[2]);
  }

  const jsonPathMatch = text.match(IMAGE_PATH_JSON_RE);
  if (jsonPathMatch && jsonPathMatch[1]) {
    const local = jsonPathMatch[1];
    const file = local.match(WORKSPACE_IMAGE_RE);
    if (file && file[1]) {
      return `/images/${trimUrl(file[1])}`;
    }
  }

  const keyMatch = text.match(
    /(image_public_url|image_proxy_url|image_local_url|image_url)\s*[:=]\s*["']?([^\s"'<>]+)["']?/i,
  );
  if (keyMatch && keyMatch[2]) {
    return trimUrl(keyMatch[2]);
  }

  const urlLine = text.match(/URL:\s*([^\s"'<>]+)/i);
  if (urlLine && urlLine[1]) {
    return trimUrl(urlLine[1]);
  }

  const localPath = text.match(WORKSPACE_IMAGE_RE);
  if (localPath && localPath[1]) {
    return `/images/${trimUrl(localPath[1])}`;
  }

  const urls = text.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  for (const candidate of urls) {
    const cleaned = trimUrl(candidate);
    if (IMAGE_EXT_RE.test(cleaned) || IMAGE_PATH_RE.test(cleaned)) {
      return cleaned;
    }
  }

  const rel = text.match(/(\/images\/[^\s"'<>]+|\/latest)\b/i);
  if (rel && rel[1]) {
    return trimUrl(rel[1]);
  }

  return "";
}

function normalizeImageUrl(url) {
  if (!url) {
    return "";
  }
  if (url.startsWith("/")) {
    const base = resolveBaseUrl();
    if (!base) {
      return "";
    }
    return `${base}${url}`;
  }
  return url;
}

function extractAudioUrl(text) {
  if (!text || typeof text !== "string") {
    return "";
  }

  const jsonMatch = text.match(AUDIO_JSON_RE);
  if (jsonMatch && jsonMatch[2]) {
    return trimUrl(jsonMatch[2]);
  }

  const jsonPathMatch = text.match(AUDIO_PATH_JSON_RE);
  if (jsonPathMatch && jsonPathMatch[1]) {
    const local = jsonPathMatch[1];
    const file = local.match(WORKSPACE_AUDIO_RE);
    if (file && file[1]) {
      return `/audio/${trimUrl(file[1])}`;
    }
  }

  const savedLine = text.match(/Audio saved to:\s*([^\s"'<>]+)/i);
  if (savedLine && savedLine[1]) {
    const local = trimUrl(savedLine[1]);
    const file = local.match(WORKSPACE_AUDIO_RE);
    if (file && file[1]) {
      return `/audio/${trimUrl(file[1])}`;
    }
  }

  const localPath = text.match(WORKSPACE_AUDIO_RE);
  if (localPath && localPath[1]) {
    return `/audio/${trimUrl(localPath[1])}`;
  }

  return "";
}

function normalizeAudioUrl(url) {
  if (!url) {
    return "";
  }
  if (url.startsWith("/")) {
    const base = resolveBaseUrl();
    if (!base) {
      return "";
    }
    return `${base}${url}`;
  }
  return url;
}

function hasImageBlock(content) {
  if (!Array.isArray(content)) {
    return false;
  }
  return content.some((block) => {
    if (!block || typeof block !== "object") {
      return false;
    }
    return block.type === "image" || block.type === "image_url";
  });
}

function collectText(content, details) {
  const parts = [];
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      if (block.type === "text" && typeof block.text === "string") {
        parts.push(block.text);
      }
    }
  }
  if (details && typeof details === "object" && typeof details.aggregated === "string") {
    parts.push(details.aggregated);
  }
  return parts.filter(Boolean).join("\n");
}

export default {
  id: "toolresult-images",
  register(api) {
    api.on(
      "tool_result_persist",
      (event) => {
        const msg = event?.message;
        if (!msg || typeof msg !== "object") {
          return;
        }
        if (msg.role !== "toolResult") {
          return;
        }
        const content = Array.isArray(msg.content) ? msg.content : [];
        const text = collectText(content, msg.details);
        const updates = [];

        if (!hasImageBlock(content)) {
          const url = extractImageUrl(text);
          const resolved = normalizeImageUrl(url);
          if (resolved) {
            updates.push({ type: "image_url", image_url: { url: resolved } });
          }
        }

        const audioUrl = normalizeAudioUrl(extractAudioUrl(text));
        if (audioUrl) {
          updates.push({ type: "text", text: `Audio: ${audioUrl}` });
        }

        if (updates.length === 0) {
          return;
        }

        const finalContent = [...content, ...updates];
        return { message: { ...msg, content: finalContent } };
      },
      { priority: 30 },
    );
  },
};
