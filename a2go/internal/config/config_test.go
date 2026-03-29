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
