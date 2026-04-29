package openclaw

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/runpod-labs/a2go/a2go/internal/paths"
)

func setupTestDirs(t *testing.T) {
	t.Helper()
	orig := paths.InstallDir
	origHome := os.Getenv("HOME")
	tmpHome := t.TempDir()
	paths.InstallDir = filepath.Join(tmpHome, ".a2go")
	os.Setenv("HOME", tmpHome)
	t.Cleanup(func() {
		paths.InstallDir = orig
		os.Setenv("HOME", origHome)
	})
}

func TestGenerateConfig_WritesOpenclawJSON(t *testing.T) {
	setupTestDirs(t)

	err := GenerateConfig("mlx-community/gemma-4-e2b-it-8bit", 131072, 32768, "mytoken", false)
	if err != nil {
		t.Fatalf("GenerateConfig: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(paths.OpenClawState(), "openclaw.json"))
	if err != nil {
		t.Fatalf("read openclaw.json: %v", err)
	}

	var cfg openclawConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	// Check model provider exists
	p, ok := cfg.Models.Providers["mlx-local"]
	if !ok {
		t.Fatal("missing mlx-local provider")
	}
	if len(p.Models) != 1 {
		t.Fatalf("expected 1 model, got %d", len(p.Models))
	}

	m := p.Models[0]
	if m.ID != "gemma-4-e2b-it-8bit" {
		t.Errorf("model ID = %q, want %q", m.ID, "gemma-4-e2b-it-8bit")
	}
	if m.ContextWindow != 131072 {
		t.Errorf("ContextWindow = %d, want %d", m.ContextWindow, 131072)
	}
	if m.MaxTokens != 32768 {
		t.Errorf("MaxTokens = %d, want %d (should use passed value, not hardcoded 8192)", m.MaxTokens, 32768)
	}
	if got := cfg.Gateway.ControlUI.AllowedOrigins; len(got) != 0 {
		t.Errorf("ControlUI.AllowedOrigins = %v, want empty list", got)
	}
	if cfg.Gateway.ControlUI.DangerouslyDisableDeviceAuth {
		t.Error("DangerouslyDisableDeviceAuth = true, want false")
	}
}

func TestGenerateConfig_CapsContextTokens(t *testing.T) {
	setupTestDirs(t)

	err := GenerateConfig("test/model", 200000, 32768, "token", false)
	if err != nil {
		t.Fatalf("GenerateConfig: %v", err)
	}

	data, _ := os.ReadFile(filepath.Join(paths.OpenClawState(), "openclaw.json"))
	var cfg openclawConfig
	json.Unmarshal(data, &cfg)

	if cfg.Agents.Defaults.ContextTokens > 135000 {
		t.Errorf("ContextTokens = %d, want <= 135000 (should be capped)", cfg.Agents.Defaults.ContextTokens)
	}
}

func TestGenerateConfig_WithImage(t *testing.T) {
	setupTestDirs(t)

	if err := os.MkdirAll(filepath.Join(paths.Skills(), "junk"), 0755); err != nil {
		t.Fatalf("mkdir legacy skill: %v", err)
	}

	err := GenerateConfig("test/model", 32768, 8192, "token", true)
	if err != nil {
		t.Fatalf("GenerateConfig: %v", err)
	}

	data, _ := os.ReadFile(filepath.Join(paths.OpenClawState(), "openclaw.json"))
	var raw map[string]json.RawMessage
	json.Unmarshal(data, &raw)

	// Skills should have extraDirs when image is enabled
	var skills skillsWithDirs
	if err := json.Unmarshal(raw["skills"], &skills); err != nil {
		t.Fatalf("unmarshal skills: %v", err)
	}
	if len(skills.Load.ExtraDirs) == 0 {
		t.Error("skills should have extraDirs when image is enabled")
	}
	if got := skills.Load.ExtraDirs[0]; got != paths.OpenClawSkills() {
		t.Fatalf("extraDirs[0] = %q, want %q", got, paths.OpenClawSkills())
	}
	if _, err := os.Stat(filepath.Join(paths.OpenClawSkills(), "a2go-image-generate", "SKILL.md")); err != nil {
		t.Fatalf("managed openclaw skill missing: %v", err)
	}
	if _, err := os.Stat(paths.Skills()); !os.IsNotExist(err) {
		t.Fatalf("legacy ~/.a2go/skills should be removed, got err=%v", err)
	}
}

func TestGenerateConfig_UsesMaxOutputTokens(t *testing.T) {
	setupTestDirs(t)

	// Pass a specific maxOutputTokens value
	err := GenerateConfig("test/model", 131072, 16384, "token", false)
	if err != nil {
		t.Fatalf("GenerateConfig: %v", err)
	}

	data, _ := os.ReadFile(filepath.Join(paths.OpenClawState(), "openclaw.json"))
	var cfg openclawConfig
	json.Unmarshal(data, &cfg)

	m := cfg.Models.Providers["mlx-local"].Models[0]
	if m.MaxTokens != 16384 {
		t.Errorf("MaxTokens = %d, want 16384", m.MaxTokens)
	}
}

func TestGenerateConfig_GatewayAuth(t *testing.T) {
	setupTestDirs(t)

	err := GenerateConfig("test/model", 32768, 8192, "secret-token", false)
	if err != nil {
		t.Fatalf("GenerateConfig: %v", err)
	}

	data, _ := os.ReadFile(filepath.Join(paths.OpenClawState(), "openclaw.json"))
	var cfg openclawConfig
	json.Unmarshal(data, &cfg)

	if cfg.Gateway.Auth.Token != "secret-token" {
		t.Errorf("auth token = %q, want %q", cfg.Gateway.Auth.Token, "secret-token")
	}
	if cfg.Gateway.Auth.Mode != "token" {
		t.Errorf("auth mode = %q, want %q", cfg.Gateway.Auth.Mode, "token")
	}
}
