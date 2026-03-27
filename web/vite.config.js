import { defineConfig } from "vite";
import { URL } from "url";

// ── Mock service definitions ──

const llm = {
  configured: true,
  port: 8000,
  modelName: "GLM-4.7-Flash",
  servedAs: "glm-4.7-flash",
  contextLength: 131072,
  hasVision: false,
};

const image = {
  configured: true,
  port: 8002,
  modelName: "FLUX.2 Klein 4B SDNQ",
};

const audio = {
  configured: true,
  port: 8001,
  modelName: "LFM2.5-Audio-1.5B",
};

const off = { configured: false };

// ── Preset configs: switch via ?mock= query param ──
//
//   http://localhost:8081/?mock=llm          (default — LLM only)
//   http://localhost:8081/?mock=llm-image    (LLM + Image)
//   http://localhost:8081/?mock=llm-audio    (LLM + Audio)
//   http://localhost:8081/?mock=full         (LLM + Image + Audio)

const presets = {
  llm: {
    services: { llm, image: off, audio: off },
    profile: { id: "auto", name: "Auto (llm)", vramTotal: 5200 },
    health: { llm: { ok: true, status: 200 }, image: off, audio: off },
  },
  "llm-image": {
    services: { llm, image, audio: off },
    profile: { id: "custom", name: "Custom (llm + image)", vramTotal: 12400 },
    health: { llm: { ok: true, status: 200 }, image: { ok: true, status: 200 }, audio: off },
  },
  "llm-audio": {
    services: { llm, image: off, audio },
    profile: { id: "custom", name: "Custom (llm + audio)", vramTotal: 8600 },
    health: { llm: { ok: true, status: 200 }, image: off, audio: { ok: true, status: 200 } },
  },
  full: {
    services: { llm, image, audio },
    profile: { id: "custom", name: "Custom (llm + image + audio)", vramTotal: 15800 },
    health: { llm: { ok: true, status: 200 }, image: { ok: true, status: 200 }, audio: { ok: true, status: 200 } },
  },
};

// Track current preset per-session (set by /?mock=xxx, default "llm")
let activePreset = "llm";

function getPreset() {
  return presets[activePreset] || presets.llm;
}

export default defineConfig({
  server: {
    port: 8081,
    strictPort: true,
  },
  plugins: [
    {
      name: "mock-api",
      configureServer(server) {
        // Intercept HTML page requests to read ?mock= param
        server.middlewares.use((req, _res, next) => {
          try {
            const url = new URL(req.url, "http://localhost");
            const mock = url.searchParams.get("mock");
            if (mock && presets[mock]) {
              activePreset = mock;
            }
          } catch {}
          next();
        });

        server.middlewares.use("/config.json", (_req, res) => {
          const p = getPreset();
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            llmBasePath: "/api/llm",
            audioBasePath: "/api/audio",
            imageBasePath: "/api/image",
            imagePublicBaseUrl: "",
            podId: "dev-local",
            gpu: { name: "NVIDIA RTX 4090", vramMb: 24564 },
            profile: p.profile,
            services: p.services,
          }));
        });

        server.middlewares.use("/health", (_req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(getPreset().health));
        });
      },
    },
  ],
});
