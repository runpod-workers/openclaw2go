package hermes

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/runpod-labs/a2go/a2go/internal/paths"
)

// hermesAPIKey returns an API key that Hermes won't reject as a placeholder.
// Hermes blocklists "changeme", "placeholder", "dummy", etc. in has_usable_secret().
func hermesAPIKey(token string) string {
	blocked := map[string]bool{
		"changeme": true, "your_api_key": true, "your-api-key": true,
		"placeholder": true, "example": true, "dummy": true,
		"null": true, "none": true,
	}
	if blocked[strings.ToLower(token)] {
		return "a2go-local-" + token
	}
	return token
}

func copyFile(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)

		if info.IsDir() {
			return os.MkdirAll(target, info.Mode().Perm())
		}

		if !info.Mode().IsRegular() {
			return nil
		}

		return copyFile(path, target, info.Mode().Perm())
	})
}

// SyncSkills copies a2go skills into the hermes skills directory so hermes can discover them.
// Copies files from ~/.a2go/skills/<skill-name>/ into ~/.hermes/skills/a2go/<skill-name>/.
// The ~/.hermes/skills/a2go subtree is fully managed by a2go and refreshed on each run.
func SyncSkills() error {
	srcDir := paths.Skills()
	dstDir := filepath.Join(paths.HermesState(), "skills", "a2go")

	if err := os.MkdirAll(dstDir, 0755); err != nil {
		return fmt.Errorf("failed to create hermes a2go skills dir: %w", err)
	}

	entries, err := os.ReadDir(srcDir)
	if err != nil {
		// No a2go skills installed yet — not an error
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	sourceSkills := make(map[string]struct{}, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		sourceSkills[e.Name()] = struct{}{}

		src := filepath.Join(srcDir, e.Name())
		dst := filepath.Join(dstDir, e.Name())

		if err := os.RemoveAll(dst); err != nil {
			return fmt.Errorf("failed to reset skill dir %s: %w", e.Name(), err)
		}
		if err := copyDir(src, dst); err != nil {
			return fmt.Errorf("failed to copy skill %s: %w", e.Name(), err)
		}
	}

	dstEntries, err := os.ReadDir(dstDir)
	if err != nil {
		return fmt.Errorf("failed to read hermes a2go skills dir: %w", err)
	}
	for _, e := range dstEntries {
		if _, ok := sourceSkills[e.Name()]; ok {
			continue
		}
		if err := os.RemoveAll(filepath.Join(dstDir, e.Name())); err != nil {
			return fmt.Errorf("failed to remove stale skill %s: %w", e.Name(), err)
		}
	}

	return nil
}

// GenerateConfig writes ~/.hermes/config.yaml and ~/.hermes/.env
// pointing at the local LLM server.
func GenerateConfig(llmModelName string, contextWindow int, authToken string) error {
	dir := paths.HermesState()

	// Create required directories
	for _, sub := range []string{"sessions", "memories", "skills", "cron", "logs"} {
		if err := os.MkdirAll(filepath.Join(dir, sub), 0755); err != nil {
			return fmt.Errorf("failed to create %s: %w", sub, err)
		}
	}

	// Sync a2go skills into hermes skills directory
	if err := SyncSkills(); err != nil {
		return fmt.Errorf("failed to sync skills: %w", err)
	}

	// Model ID: strip :quant suffix but keep org/repo format
	// (must match what mlx_lm.server reports via /v1/models)
	modelID := llmModelName
	if idx := strings.LastIndex(modelID, ":"); idx > 0 {
		modelID = modelID[:idx]
	}

	apiKey := hermesAPIKey(authToken)

	// config.yaml
	configYAML := fmt.Sprintf(`model:
  provider: custom
  default: %s
  base_url: http://localhost:8000/v1
  api_key: %s
  context_length: %d
memory:
  memory_enabled: true
  user_profile_enabled: true
terminal:
  backend: local
  persistent_shell: true
`, modelID, apiKey, contextWindow)

	if err := os.WriteFile(filepath.Join(dir, "config.yaml"), []byte(configYAML), 0600); err != nil {
		return fmt.Errorf("failed to write config.yaml: %w", err)
	}

	// .env
	dotEnv := fmt.Sprintf("OPENAI_API_KEY=%s\nOPENAI_BASE_URL=http://localhost:8000/v1\n", apiKey)

	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte(dotEnv), 0600); err != nil {
		return fmt.Errorf("failed to write .env: %w", err)
	}

	return nil
}
