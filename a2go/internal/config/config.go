package config

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/runpod-labs/a2go/a2go/internal/paths"
)

// ModelSlug strips the ":quant" suffix from a model reference.
// Format is "org/repo:quant" (e.g. "mlx-community/Qwen3.5-4B-8bit:8bit").
// Docker entrypoint parses this internally; MLX needs the bare HuggingFace slug.
func ModelSlug(model string) string {
	if i := strings.LastIndex(model, ":"); i > 0 {
		return model[:i]
	}
	return model
}

type ServiceConfig struct {
	Model string `json:"model"`
}

func (s *ServiceConfig) UnmarshalJSON(data []byte) error {
	var str string
	if err := json.Unmarshal(data, &str); err != nil {
		return fmt.Errorf("expected string for service config, got: %s", string(data))
	}
	s.Model = str
	return nil
}

func (s ServiceConfig) MarshalJSON() ([]byte, error) {
	return json.Marshal(s.Model)
}

type AudioConfig struct {
	Enabled *bool  `json:"enabled,omitempty"`
	Model   string `json:"model,omitempty"`
}

func (a *AudioConfig) UnmarshalJSON(data []byte) error {
	var str string
	if err := json.Unmarshal(data, &str); err != nil {
		return fmt.Errorf("expected string for audio config, got: %s", string(data))
	}
	a.Model = str
	return nil
}

func (a AudioConfig) MarshalJSON() ([]byte, error) {
	if a.Enabled != nil {
		type plain AudioConfig
		return json.Marshal(plain(a))
	}
	return json.Marshal(a.Model)
}

type Config struct {
	LLM           *ServiceConfig `json:"llm,omitempty"`
	Image         *ServiceConfig `json:"image,omitempty"`
	Audio         *AudioConfig   `json:"audio,omitempty"`
	ContextLength *int           `json:"contextLength,omitempty"`
	AuthToken     string         `json:"authToken,omitempty"`
}

func (c *Config) AudioEnabled() bool {
	if c.Audio == nil || c.Audio.Enabled == nil {
		return true // default
	}
	return *c.Audio.Enabled
}

func (c *Config) GetAuthToken() string {
	if c.AuthToken == "" {
		return "changeme"
	}
	return c.AuthToken
}

func (c *Config) GetContextLength() int {
	if c.ContextLength != nil {
		return *c.ContextLength
	}
	return 32768
}

func Parse(raw string) (*Config, error) {
	var cfg Config
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return nil, fmt.Errorf("invalid JSON config: %w", err)
	}
	if cfg.LLM == nil || cfg.LLM.Model == "" {
		return nil, fmt.Errorf("llm.model is required")
	}
	return &cfg, nil
}

func Save(cfg *Config) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(paths.LastConfig(), data, 0644)
}

func LastConfigPath() string {
	return paths.LastConfig()
}

func LoadLastRaw() (string, error) {
	data, err := os.ReadFile(paths.LastConfig())
	if err != nil {
		return "", fmt.Errorf("no previous config found — pass config JSON to start")
	}
	return string(data), nil
}

func LoadLast() (*Config, error) {
	data, err := os.ReadFile(paths.LastConfig())
	if err != nil {
		return nil, fmt.Errorf("no previous config found — pass config JSON to start")
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	if cfg.LLM == nil || cfg.LLM.Model == "" {
		return nil, fmt.Errorf("saved config is missing llm.model")
	}
	return &cfg, nil
}
