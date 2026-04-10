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

func TestSyncSkills_WritesOnlyBundledSkills(t *testing.T) {
	setupTestDirs(t)

	if err := SyncSkills(); err != nil {
		t.Fatalf("SyncSkills: %v", err)
	}

	hermesSkills := paths.HermesSkills()
	expected := map[string]struct{}{
		"a2go-image-generate": {},
		"a2go-text-to-speech": {},
		"a2go-speech-to-text": {},
	}

	entries, err := os.ReadDir(hermesSkills)
	if err != nil {
		t.Fatalf("read hermes skills: %v", err)
	}
	if len(entries) != len(expected) {
		t.Fatalf("got %d skills, want %d", len(entries), len(expected))
	}

	for _, entry := range entries {
		if _, ok := expected[entry.Name()]; !ok {
			t.Fatalf("unexpected skill copied: %s", entry.Name())
		}
		dir := filepath.Join(hermesSkills, entry.Name())
		fi, err := os.Lstat(dir)
		if err != nil {
			t.Fatalf("stat %s: %v", entry.Name(), err)
		}
		if fi.Mode()&os.ModeSymlink != 0 {
			t.Fatalf("%s should be a real directory", entry.Name())
		}
		data, err := os.ReadFile(filepath.Join(dir, "SKILL.md"))
		if err != nil {
			t.Fatalf("read %s/SKILL.md: %v", entry.Name(), err)
		}
		if !strings.Contains(string(data), "name: "+entry.Name()) {
			t.Fatalf("unexpected bundled skill contents for %s", entry.Name())
		}
	}
}

func TestSyncSkills_CleansManagedDirAndLegacySkillsDir(t *testing.T) {
	setupTestDirs(t)

	legacySkill := filepath.Join(paths.Skills(), "image-generate")
	if err := os.MkdirAll(legacySkill, 0755); err != nil {
		t.Fatalf("mkdir legacy skill: %v", err)
	}
	if err := os.WriteFile(filepath.Join(legacySkill, "SKILL.md"), []byte("legacy"), 0644); err != nil {
		t.Fatalf("write legacy skill: %v", err)
	}

	hermesSkills := paths.HermesSkills()
	if err := os.MkdirAll(hermesSkills, 0755); err != nil {
		t.Fatalf("mkdir hermes skills: %v", err)
	}
	if err := os.WriteFile(filepath.Join(hermesSkills, "random-file.txt"), []byte("junk"), 0644); err != nil {
		t.Fatalf("write stale file: %v", err)
	}
	staleDir := filepath.Join(hermesSkills, "removed-skill")
	if err := os.MkdirAll(staleDir, 0755); err != nil {
		t.Fatalf("mkdir stale dir: %v", err)
	}
	staleLink := filepath.Join(hermesSkills, "a2go-image-generate")
	if err := os.Symlink("/nonexistent", staleLink); err != nil {
		t.Fatalf("create stale symlink: %v", err)
	}

	if err := SyncSkills(); err != nil {
		t.Fatalf("SyncSkills: %v", err)
	}

	if _, err := os.Stat(paths.Skills()); !os.IsNotExist(err) {
		t.Fatalf("legacy ~/.a2go/skills should be removed, got err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(hermesSkills, "random-file.txt")); !os.IsNotExist(err) {
		t.Fatalf("stale managed file should be removed, got err=%v", err)
	}
	if _, err := os.Stat(staleDir); !os.IsNotExist(err) {
		t.Fatalf("stale managed skill should be removed, got err=%v", err)
	}
	fi, err := os.Lstat(staleLink)
	if err != nil {
		t.Fatalf("stat regenerated skill: %v", err)
	}
	if fi.Mode()&os.ModeSymlink != 0 {
		t.Fatal("regenerated bundled skill should not be a symlink")
	}
	if !fi.IsDir() {
		t.Fatal("regenerated bundled skill should be a directory")
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
