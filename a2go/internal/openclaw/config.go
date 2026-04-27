package openclaw

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/runpod-labs/a2go/a2go/internal/agentskills"
	"github.com/runpod-labs/a2go/a2go/internal/paths"
)

type openclawConfig struct {
	Models  modelsBlock  `json:"models"`
	Agents  agentsBlock  `json:"agents"`
	Skills  interface{}  `json:"skills"`
	Plugins interface{}  `json:"plugins"`
	Gateway gatewayBlock `json:"gateway"`
	Logging loggingBlock `json:"logging"`
}

type modelsBlock struct {
	Providers map[string]provider `json:"providers"`
}
type provider struct {
	BaseURL string  `json:"baseUrl"`
	APIKey  string  `json:"apiKey"`
	API     string  `json:"api"`
	Models  []model `json:"models"`
}
type model struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	ContextWindow int      `json:"contextWindow"`
	MaxTokens     int      `json:"maxTokens"`
	Reasoning     bool     `json:"reasoning"`
	Input         []string `json:"input"`
	Cost          cost     `json:"cost"`
}
type cost struct {
	Input      int `json:"input"`
	Output     int `json:"output"`
	CacheRead  int `json:"cacheRead"`
	CacheWrite int `json:"cacheWrite"`
}

type agentsBlock struct {
	Defaults agentDefaults `json:"defaults"`
}
type agentDefaults struct {
	Model         agentModel `json:"model"`
	ContextTokens int        `json:"contextTokens"`
}
type agentModel struct {
	Primary string `json:"primary"`
}

type gatewayBlock struct {
	Mode      string        `json:"mode"`
	Bind      string        `json:"bind"`
	ControlUI controlUIConf `json:"controlUi"`
	Auth      authConf      `json:"auth"`
	Remote    authConf      `json:"remote"`
}
type controlUIConf struct {
	AllowedOrigins               []string `json:"allowedOrigins"`
	DangerouslyDisableDeviceAuth bool     `json:"dangerouslyDisableDeviceAuth"`
}
type authConf struct {
	Mode  string `json:"mode,omitempty"`
	Token string `json:"token"`
}

type loggingBlock struct {
	Level string `json:"level"`
}

type skillsWithDirs struct {
	Load    skillLoad          `json:"load"`
	Entries map[string]enabled `json:"entries"`
}
type skillLoad struct {
	ExtraDirs []string `json:"extraDirs"`
}
type enabled struct {
	Enabled bool `json:"enabled"`
}

func GenerateConfig(llmModelName string, contextWindow int, maxOutputTokens int, authToken string, hasImage bool) error {
	ctxTokens := contextWindow
	if ctxTokens > 135000 {
		ctxTokens = 135000
	}

	modelID := llmModelName
	if idx := strings.LastIndex(modelID, "/"); idx >= 0 {
		modelID = modelID[idx+1:]
	}

	var skills interface{} = struct{}{}
	var plugins interface{} = struct{}{}

	if err := agentskills.Sync(paths.OpenClawSkills()); err != nil {
		return err
	}
	if err := agentskills.CleanupLegacyDir(paths.Skills()); err != nil {
		return err
	}

	if hasImage {
		skills = skillsWithDirs{
			Load: skillLoad{ExtraDirs: []string{paths.OpenClawSkills()}},
			Entries: map[string]enabled{
				"openai-image-gen": {Enabled: false},
				"nano-banana-pro":  {Enabled: false},
			},
		}
	}

	cfg := openclawConfig{
		Models: modelsBlock{
			Providers: map[string]provider{
				"mlx-local": {
					BaseURL: "http://localhost:8000/v1",
					APIKey:  "local",
					API:     "openai-completions",
					Models: []model{{
						ID:            modelID,
						Name:          modelID,
						ContextWindow: contextWindow,
						MaxTokens:     maxOutputTokens,
						Reasoning:     false,
						Input:         []string{"text"},
						Cost:          cost{},
					}},
				},
			},
		},
		Agents: agentsBlock{
			Defaults: agentDefaults{
				Model:         agentModel{Primary: "mlx-local/" + modelID},
				ContextTokens: ctxTokens,
			},
		},
		Skills:  skills,
		Plugins: plugins,
		Gateway: gatewayBlock{
			Mode:      "local",
			Bind:      "lan",
			ControlUI: controlUIConf{AllowedOrigins: []string{}, DangerouslyDisableDeviceAuth: false},
			Auth:      authConf{Mode: "token", Token: authToken},
			Remote:    authConf{Token: authToken},
		},
		Logging: loggingBlock{Level: "info"},
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	dir := paths.OpenClawState()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "openclaw.json"), data, 0600)
}
