package hermes

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/runpod-labs/a2go/a2go/internal/agentskills"
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

// SyncSkills fully regenerates the hermes-managed a2go skill subtree from bundled assets.
func SyncSkills() error {
	if err := agentskills.Sync(paths.HermesSkills()); err != nil {
		return fmt.Errorf("failed to sync bundled skills: %w", err)
	}
	if err := agentskills.CleanupLegacyDir(paths.Skills()); err != nil {
		return fmt.Errorf("failed to remove legacy skills dir: %w", err)
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
