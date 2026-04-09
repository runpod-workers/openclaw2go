package hermes

import (
	"os"
	"path/filepath"
	"strings"
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

func TestGenerateConfig_WritesConfigYAML(t *testing.T) {
	setupTestDirs(t)

	err := GenerateConfig("mlx-community/gemma-4-e2b-it-8bit:8bit", 131072, "mytoken")
	if err != nil {
		t.Fatalf("GenerateConfig: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(paths.HermesState(), "config.yaml"))
	if err != nil {
		t.Fatalf("read config.yaml: %v", err)
	}
	content := string(data)

	// Should strip :quant suffix
	if !strings.Contains(content, "mlx-community/gemma-4-e2b-it-8bit") {
		t.Error("config.yaml should contain model ID without :quant suffix")
	}
	if strings.Contains(content, ":8bit") {
		t.Error("config.yaml should not contain :8bit quant suffix")
	}

	// Should have correct context length (from catalog, not hardcoded 32768)
	if !strings.Contains(content, "context_length: 131072") {
		t.Error("config.yaml should contain context_length: 131072")
	}

	// Should NOT have max_tokens — hermes defaults to unlimited for custom providers,
	// the actual cap is set via --max-tokens on the mlx_lm server command
	if strings.Contains(content, "max_tokens") {
		t.Error("config.yaml should not contain max_tokens — hermes defaults to unlimited")
	}
}

func TestGenerateConfig_WritesDotEnv(t *testing.T) {
	setupTestDirs(t)

	err := GenerateConfig("test/model", 32768, "mytoken")
	if err != nil {
		t.Fatalf("GenerateConfig: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(paths.HermesState(), ".env"))
	if err != nil {
		t.Fatalf("read .env: %v", err)
	}
	content := string(data)

	if !strings.Contains(content, "OPENAI_API_KEY=mytoken") {
		t.Error(".env should contain OPENAI_API_KEY")
	}
	if !strings.Contains(content, "OPENAI_BASE_URL=http://localhost:8000/v1") {
		t.Error(".env should contain OPENAI_BASE_URL")
	}
}

func TestGenerateConfig_BlockedToken(t *testing.T) {
	setupTestDirs(t)

	err := GenerateConfig("test/model", 32768, "changeme")
	if err != nil {
		t.Fatalf("GenerateConfig: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(paths.HermesState(), "config.yaml"))
	if err != nil {
		t.Fatalf("read config.yaml: %v", err)
	}
	content := string(data)

	// Should prefix blocked token with "a2go-local-"
	if !strings.Contains(content, "a2go-local-changeme") {
		t.Error("config.yaml should use prefixed API key for blocked tokens")
	}
}

func TestGenerateConfig_CreatesDirectories(t *testing.T) {
	setupTestDirs(t)

	err := GenerateConfig("test/model", 32768, "token")
	if err != nil {
		t.Fatalf("GenerateConfig: %v", err)
	}

	for _, sub := range []string{"sessions", "memories", "skills", "cron", "logs"} {
		dir := filepath.Join(paths.HermesState(), sub)
		if fi, err := os.Stat(dir); err != nil || !fi.IsDir() {
			t.Errorf("expected directory %s to exist", dir)
		}
	}
}

func TestSyncSkills_NoSourceDir(t *testing.T) {
	setupTestDirs(t)

	// SyncSkills should not error when source dir doesn't exist
	if err := SyncSkills(); err != nil {
		t.Fatalf("SyncSkills with no source dir: %v", err)
	}
}

func TestSyncSkills_CreatesSymlinks(t *testing.T) {
	setupTestDirs(t)

	// Create fake a2go skills
	skillDir := filepath.Join(paths.Skills(), "a2go-image-generate")
	os.MkdirAll(skillDir, 0755)
	os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte("# test"), 0644)

	skillDir2 := filepath.Join(paths.Skills(), "a2go-text-to-speech")
	os.MkdirAll(skillDir2, 0755)
	os.WriteFile(filepath.Join(skillDir2, "SKILL.md"), []byte("# test2"), 0644)

	// Create hermes skills dir
	os.MkdirAll(filepath.Join(paths.HermesState(), "skills"), 0755)

	if err := SyncSkills(); err != nil {
		t.Fatalf("SyncSkills: %v", err)
	}

	// Check symlinks exist
	hermesA2goSkills := filepath.Join(paths.HermesState(), "skills", "a2go")
	for _, skill := range []string{"a2go-image-generate", "a2go-text-to-speech"} {
		link := filepath.Join(hermesA2goSkills, skill)
		fi, err := os.Lstat(link)
		if err != nil {
			t.Errorf("symlink %s not created: %v", skill, err)
			continue
		}
		if fi.Mode()&os.ModeSymlink == 0 {
			t.Errorf("%s should be a symlink", skill)
		}
		// Verify the symlink target is readable
		target, err := os.Readlink(link)
		if err != nil {
			t.Errorf("readlink %s: %v", skill, err)
			continue
		}
		if !strings.Contains(target, skill) {
			t.Errorf("symlink target %q should contain %q", target, skill)
		}
	}
}

func TestSyncSkills_UpdatesExistingSymlinks(t *testing.T) {
	setupTestDirs(t)

	// Create a2go skills
	skillDir := filepath.Join(paths.Skills(), "a2go-image-generate")
	os.MkdirAll(skillDir, 0755)

	// Create hermes skills dir with an existing (possibly stale) symlink
	hermesA2goSkills := filepath.Join(paths.HermesState(), "skills", "a2go")
	os.MkdirAll(hermesA2goSkills, 0755)
	staleLink := filepath.Join(hermesA2goSkills, "a2go-image-generate")
	os.Symlink("/nonexistent", staleLink)

	// SyncSkills should replace the stale symlink
	if err := SyncSkills(); err != nil {
		t.Fatalf("SyncSkills: %v", err)
	}

	target, err := os.Readlink(staleLink)
	if err != nil {
		t.Fatalf("readlink: %v", err)
	}
	if target == "/nonexistent" {
		t.Error("symlink should have been updated from stale target")
	}
	if target != skillDir {
		t.Errorf("symlink target = %q, want %q", target, skillDir)
	}
}

func TestHermesAPIKey_BlockedTokens(t *testing.T) {
	blocked := []string{"changeme", "placeholder", "dummy", "example", "null", "none", "your_api_key", "your-api-key"}
	for _, token := range blocked {
		got := hermesAPIKey(token)
		if !strings.HasPrefix(got, "a2go-local-") {
			t.Errorf("hermesAPIKey(%q) = %q, want prefix 'a2go-local-'", token, got)
		}
	}
}

func TestHermesAPIKey_NormalToken(t *testing.T) {
	got := hermesAPIKey("my-real-token-123")
	if got != "my-real-token-123" {
		t.Errorf("hermesAPIKey(normal) = %q, want unchanged", got)
	}
}
