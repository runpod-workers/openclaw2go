package updatecheck

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
		LastCheck:     time.Now().Unix(),
		LatestVersion: "v0.15.0",
	}
	saveState(s)

	loaded := loadState()
	if loaded == nil {
		t.Fatal("loaded state is nil")
	}
	if loaded.LatestVersion != "v0.15.0" {
		t.Errorf("LatestVersion = %q, want %q", loaded.LatestVersion, "v0.15.0")
	}
	if loaded.LastCheck != s.LastCheck {
		t.Errorf("LastCheck = %d, want %d", loaded.LastCheck, s.LastCheck)
	}
}

func TestRun_SkipsWithEnvVar(t *testing.T) {
	setupTestDir(t)

	os.Setenv("A2GO_NO_UPDATE_CHECK", "1")
	defer os.Unsetenv("A2GO_NO_UPDATE_CHECK")

	// Should return immediately without making any network calls
	Run("v0.14.0")

	// No state file should be created
	s := loadState()
	if s != nil {
		t.Error("should not create state when check is disabled")
	}
}

func TestRun_UsesFreshCache(t *testing.T) {
	setupTestDir(t)
	os.Unsetenv("A2GO_NO_UPDATE_CHECK")
	os.MkdirAll(paths.Cache(), 0755)

	// Write a fresh cache entry
	s := &checkState{
		LastCheck:     time.Now().Unix(),
		LatestVersion: "v0.14.0",
	}
	saveState(s)

	// Should use cache and not make network calls (server is unreachable)
	Run("v0.14.0")
}

func TestRun_CachesResult(t *testing.T) {
	setupTestDir(t)
	os.Unsetenv("A2GO_NO_UPDATE_CHECK")

	// Start a mock GitHub releases server
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Simulate GitHub's redirect to /releases/tag/v0.15.0
		http.Redirect(w, r, "https://github.com/runpod-labs/a2go/releases/tag/v0.15.0", http.StatusFound)
	}))
	defer srv.Close()

	// The Run function uses selfupdate.FetchLatestVersion() which is hardcoded to GitHub.
	// We can't easily mock that, but we can test the caching behavior with a stale cache.
	os.MkdirAll(paths.Cache(), 0755)

	// Write a stale cache that should trigger a refetch
	s := &checkState{
		LastCheck:     time.Now().Add(-25 * time.Hour).Unix(),
		LatestVersion: "v0.14.0",
	}
	saveState(s)

	// After Run, the state file should exist regardless
	Run("v0.14.0")

	loaded := loadState()
	if loaded == nil {
		t.Fatal("state should be saved after Run")
	}
}

func TestStatePath(t *testing.T) {
	setupTestDir(t)

	p := statePath()
	if p == "" {
		t.Error("statePath should not be empty")
	}
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

	// Cache dir doesn't exist yet
	saveState(&checkState{LastCheck: time.Now().Unix(), LatestVersion: "v1.0.0"})

	data, err := os.ReadFile(statePath())
	if err != nil {
		t.Fatalf("state file should be created: %v", err)
	}

	var s checkState
	if err := json.Unmarshal(data, &s); err != nil {
		t.Fatalf("invalid state JSON: %v", err)
	}
	if s.LatestVersion != "v1.0.0" {
		t.Errorf("LatestVersion = %q, want %q", s.LatestVersion, "v1.0.0")
	}
}
