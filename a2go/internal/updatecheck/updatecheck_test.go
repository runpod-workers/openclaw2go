package updatecheck

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/runpod-labs/a2go/a2go/internal/paths"
)

func setupTestDir(t *testing.T) {
	t.Helper()
	orig := paths.InstallDir
	paths.InstallDir = t.TempDir()
	t.Cleanup(func() { paths.InstallDir = orig })
}

func TestLoadState_NoFile(t *testing.T) {
	setupTestDir(t)

	s := loadState()
	if s != nil {
		t.Error("expected nil state when no file exists")
	}
}

func TestSaveAndLoadState(t *testing.T) {
	setupTestDir(t)
	os.MkdirAll(paths.Cache(), 0755)

	s := &checkState{
		LastCheck: time.Now().Unix(),
		CLI:       &cliState{LatestVersion: "v0.15.0"},
		Hermes:    &hermState{CommitsBehind: 3},
		PythonPackages: []pipState{
			{Name: "mlx-lm", Installed: "0.31.1", Latest: "0.31.2"},
		},
	}
	saveState(s)

	loaded := loadState()
	if loaded == nil {
		t.Fatal("loaded state is nil")
	}
	if loaded.CLI == nil || loaded.CLI.LatestVersion != "v0.15.0" {
		t.Errorf("CLI.LatestVersion = %v, want v0.15.0", loaded.CLI)
	}
	if loaded.Hermes == nil || loaded.Hermes.CommitsBehind != 3 {
		t.Errorf("Hermes.CommitsBehind = %v, want 3", loaded.Hermes)
	}
	if len(loaded.PythonPackages) != 1 || loaded.PythonPackages[0].Name != "mlx-lm" {
		t.Errorf("PythonPackages = %v, want [mlx-lm]", loaded.PythonPackages)
	}
}

func TestRun_SkipsWithEnvVar(t *testing.T) {
	setupTestDir(t)

	os.Setenv("A2GO_NO_UPDATE_CHECK", "1")
	defer os.Unsetenv("A2GO_NO_UPDATE_CHECK")

	Run("v0.14.0")

	s := loadState()
	if s != nil {
		t.Error("should not create state when check is disabled")
	}
}

func TestRun_UsesFreshCache(t *testing.T) {
	setupTestDir(t)
	os.Unsetenv("A2GO_NO_UPDATE_CHECK")
	os.MkdirAll(paths.Cache(), 0755)

	s := &checkState{
		LastCheck: time.Now().Unix(),
		CLI:       &cliState{LatestVersion: "v0.14.0"},
	}
	saveState(s)

	// Should use cache and not make network calls
	Run("v0.14.0")
}

func TestLoadState_InvalidJSON(t *testing.T) {
	setupTestDir(t)
	os.MkdirAll(paths.Cache(), 0755)
	os.WriteFile(statePath(), []byte("not json"), 0644)

	s := loadState()
	if s != nil {
		t.Error("expected nil state for invalid JSON")
	}
}

func TestSaveState_CreatesDir(t *testing.T) {
	setupTestDir(t)

	saveState(&checkState{
		LastCheck: time.Now().Unix(),
		CLI:       &cliState{LatestVersion: "v1.0.0"},
	})

	data, err := os.ReadFile(statePath())
	if err != nil {
		t.Fatalf("state file should be created: %v", err)
	}

	var s checkState
	if err := json.Unmarshal(data, &s); err != nil {
		t.Fatalf("invalid state JSON: %v", err)
	}
	if s.CLI == nil || s.CLI.LatestVersion != "v1.0.0" {
		t.Errorf("CLI.LatestVersion = %v, want v1.0.0", s.CLI)
	}
}

func TestCheckHermesBehind_NoRepo(t *testing.T) {
	// When hermes isn't installed as git repo, should return 0
	origHome := os.Getenv("HOME")
	os.Setenv("HOME", t.TempDir())
	defer os.Setenv("HOME", origHome)

	behind := checkHermesBehind()
	if behind != 0 {
		t.Errorf("checkHermesBehind() = %d, want 0 when no repo", behind)
	}
}

func TestCheckPipOutdated_NoVenv(t *testing.T) {
	setupTestDir(t)

	// When venv doesn't exist, should return nil
	pkgs := checkPipOutdated()
	if pkgs != nil {
		t.Errorf("checkPipOutdated() = %v, want nil when no venv", pkgs)
	}
}

func TestTrackedPackages(t *testing.T) {
	expected := map[string]bool{"mlx-lm": true, "mlx-audio": true, "mflux": true}
	for _, p := range trackedPackages {
		if !expected[p] {
			t.Errorf("unexpected tracked package: %s", p)
		}
	}
	if len(trackedPackages) != len(expected) {
		t.Errorf("trackedPackages has %d entries, want %d", len(trackedPackages), len(expected))
	}
}

func TestPrintHints_NoUpdates(t *testing.T) {
	// Should not panic with empty state
	printHints("v0.14.0", &checkState{})
}

func TestPrintHints_AllUpdates(t *testing.T) {
	// Should not panic with all fields populated
	state := &checkState{
		CLI:    &cliState{LatestVersion: "v0.15.0"},
		Hermes: &hermState{CommitsBehind: 5},
		PythonPackages: []pipState{
			{Name: "mlx-lm", Installed: "0.31.1", Latest: "0.31.2"},
			{Name: "mflux", Installed: "0.1.0", Latest: "0.2.0"},
		},
	}
	printHints("v0.14.0", state)
}
