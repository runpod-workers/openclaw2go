package config

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/runpod-labs/a2go/a2go/internal/paths"
)

func setupTestDir(t *testing.T) {
	t.Helper()
	orig := paths.InstallDir
	paths.InstallDir = t.TempDir()
	t.Cleanup(func() { paths.InstallDir = orig })
}

func TestSaveAndLoadLast(t *testing.T) {
	setupTestDir(t)

	cfg := &Config{
		Agent: "hermes",
		LLM:   &ServiceConfig{Model: "test/model:4bit"},
	}
	if err := Save(cfg); err != nil {
		t.Fatalf("Save: %v", err)
	}

	loaded, err := LoadLast()
	if err != nil {
		t.Fatalf("LoadLast: %v", err)
	}
	if loaded.Agent != "hermes" {
		t.Errorf("Agent = %q, want %q", loaded.Agent, "hermes")
	}
	if loaded.LLM.Model != "test/model:4bit" {
		t.Errorf("LLM.Model = %q, want %q", loaded.LLM.Model, "test/model:4bit")
	}
}

func TestLoadLast_NoFile(t *testing.T) {
	setupTestDir(t)

	_, err := LoadLast()
	if err == nil {
		t.Fatal("expected error when no saved config")
	}
}

func TestLoadLast_OpenClawAgent(t *testing.T) {
	setupTestDir(t)

	cfg := &Config{
		Agent: "openclaw",
		LLM:   &ServiceConfig{Model: "test/model:4bit"},
	}
	Save(cfg)

	loaded, err := LoadLast()
	if err != nil {
		t.Fatalf("LoadLast: %v", err)
	}
	if loaded.Agent != "openclaw" {
		t.Errorf("Agent = %q, want %q", loaded.Agent, "openclaw")
	}
}

func TestAudioEnabled_Default(t *testing.T) {
	cfg := &Config{}
	if !cfg.AudioEnabled() {
		t.Error("AudioEnabled() should be true by default (nil Audio)")
	}
}

func TestAudioEnabled_ExplicitOff(t *testing.T) {
	f := false
	cfg := &Config{Audio: &AudioConfig{Enabled: &f}}
	if cfg.AudioEnabled() {
		t.Error("AudioEnabled() should be false when explicitly disabled")
	}
}

func TestAudioEnabled_ExplicitOn(t *testing.T) {
	tr := true
	cfg := &Config{Audio: &AudioConfig{Enabled: &tr}}
	if !cfg.AudioEnabled() {
		t.Error("AudioEnabled() should be true when explicitly enabled")
	}
}

func TestAudioEnabled_NilEnabled(t *testing.T) {
	cfg := &Config{Audio: &AudioConfig{Model: "some/model"}}
	if !cfg.AudioEnabled() {
		t.Error("AudioEnabled() should be true when Enabled is nil (model set)")
	}
}

func TestGetMaxOutputTokens_Default(t *testing.T) {
	cfg := &Config{}
	// Default context is 32768, so maxOutputTokens = 32768/4 = 8192
	got := cfg.GetMaxOutputTokens()
	if got != 8192 {
		t.Errorf("GetMaxOutputTokens() = %d, want 8192 (contextLength/4)", got)
	}
}

func TestGetMaxOutputTokens_Explicit(t *testing.T) {
	mot := 16384
	cfg := &Config{MaxOutputTokens: &mot}
	got := cfg.GetMaxOutputTokens()
	if got != 16384 {
		t.Errorf("GetMaxOutputTokens() = %d, want 16384", got)
	}
}

func TestGetMaxOutputTokens_LargeContext(t *testing.T) {
	ctx := 131072
	cfg := &Config{ContextLength: &ctx}
	got := cfg.GetMaxOutputTokens()
	// 131072/4 = 32768, which is the cap
	if got != 32768 {
		t.Errorf("GetMaxOutputTokens() = %d, want 32768 (capped)", got)
	}
}

func TestGetMaxOutputTokens_SmallContext(t *testing.T) {
	ctx := 4096
	cfg := &Config{ContextLength: &ctx}
	got := cfg.GetMaxOutputTokens()
	// 4096/4 = 1024, but minimum is 4096
	if got != 4096 {
		t.Errorf("GetMaxOutputTokens() = %d, want 4096 (floor)", got)
	}
}

func TestGetMaxOutputTokens_VeryLargeContext(t *testing.T) {
	ctx := 1000000
	cfg := &Config{ContextLength: &ctx}
	got := cfg.GetMaxOutputTokens()
	// 1000000/4 = 250000, but capped at 32768
	if got != 32768 {
		t.Errorf("GetMaxOutputTokens() = %d, want 32768 (capped at max)", got)
	}
}

func TestGetContextLength_Default(t *testing.T) {
	cfg := &Config{}
	got := cfg.GetContextLength()
	if got != 32768 {
		t.Errorf("GetContextLength() = %d, want 32768", got)
	}
}

func TestGetContextLength_Explicit(t *testing.T) {
	ctx := 131072
	cfg := &Config{ContextLength: &ctx}
	got := cfg.GetContextLength()
	if got != 131072 {
		t.Errorf("GetContextLength() = %d, want 131072", got)
	}
}

func TestLoadLast_PreservesAgentForGatewayResolution(t *testing.T) {
	setupTestDir(t)

	// Save hermes config
	hermesCfg := &Config{
		Agent: "hermes",
		LLM:   &ServiceConfig{Model: "test/model:4bit"},
	}
	if err := Save(hermesCfg); err != nil {
		t.Fatalf("Save: %v", err)
	}

	// Verify the raw JSON contains the agent field
	data, err := os.ReadFile(paths.LastConfig())
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	var raw map[string]json.RawMessage
	json.Unmarshal(data, &raw)
	if _, ok := raw["agent"]; !ok {
		t.Fatal("saved config JSON is missing 'agent' field")
	}

	// Load and verify
	loaded, _ := LoadLast()
	if loaded.Agent != "hermes" {
		t.Errorf("loaded Agent = %q, want 'hermes' — gateway resolution depends on this", loaded.Agent)
	}
}
