package cmd

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/runpod-labs/a2go/a2go/internal/catalog"
)

const catalogURL = "https://a2go.run/v1/catalog.json"

var (
	flagModelsType    string
	flagModelsOS      string
	flagModelsMaxVRAM int
)

var modelsCmd = &cobra.Command{
	Use:   "models",
	Short: "List available models",
	Long: `List available models from the a2go catalog.

  a2go models                      # All models
  a2go models --type llm           # LLMs only
  a2go models --os mac             # Mac/MLX models only
  a2go models --type llm --os mac  # Mac LLMs only
  a2go models --max-vram 24        # Models that fit in 24GB

Output format: type | os | vram | context | repo:bits | name
Use the repo:bits value with --llm, --image, or --audio flags.`,
	Args: cobra.NoArgs,
	RunE: runModels,
}

func init() {
	modelsCmd.Flags().StringVar(&flagModelsType, "type", "", "filter by type (llm, image, audio)")
	modelsCmd.Flags().StringVar(&flagModelsOS, "os", "", "filter by os (linux, windows, mac)")
	modelsCmd.Flags().IntVar(&flagModelsMaxVRAM, "max-vram", 0, "max VRAM in GB (e.g. 24 for 24GB GPU)")
}

type catalogJSON struct {
	Models []catalogModel `json:"models"`
}

type catalogModel struct {
	Name      string           `json:"name"`
	Type      string           `json:"type"`
	Engine    string           `json:"engine"`
	Repo      string           `json:"repo"`
	Bits      *int             `json:"bits"`
	VRAM      *catalogVRAM     `json:"vram"`
	Defaults  *catalogDefaults `json:"defaults"`
	Platforms []string         `json:"platforms"`
}

type catalogVRAM struct {
	Model    int `json:"model"`
	Overhead int `json:"overhead"`
}

type catalogDefaults struct {
	ContextLength   *int `json:"contextLength"`
	MaxOutputTokens *int `json:"maxOutputTokens"`
}

var mlxEngines = map[string]bool{
	"mlx-lm":    true,
	"mflux":     true,
	"mlx-audio": true,
}

var wandlerEngines = map[string]bool{
	"wandler": true,
}

func modelOS(engine string, platforms []string) string {
	if len(platforms) > 0 {
		return strings.Join(platforms, ",")
	}
	if mlxEngines[engine] {
		return "mac"
	}
	return "linux,windows"
}

func formatVRAM(v *catalogVRAM) string {
	if v == nil {
		return "-"
	}
	totalMB := v.Model + v.Overhead
	gb := float64(totalMB) / 1024.0
	if gb >= 100 {
		return fmt.Sprintf("%.0fGB", gb)
	}
	return fmt.Sprintf("%.1fGB", gb)
}

func formatContext(d *catalogDefaults) string {
	if d == nil || d.ContextLength == nil {
		return "-"
	}
	ctx := *d.ContextLength
	if ctx >= 1000000 {
		return fmt.Sprintf("%.0fM ctx", float64(ctx)/1000000)
	}
	return fmt.Sprintf("%.0fK ctx", float64(ctx)/1000)
}

func runModels(cmd *cobra.Command, args []string) error {
	data, err := catalog.Fetch(catalogURL, 10*time.Second)
	if err != nil {
		return err
	}

	var catalog catalogJSON
	if err := json.Unmarshal(data, &catalog); err != nil {
		return fmt.Errorf("failed to parse catalog: %w", err)
	}

	filterType := strings.ToLower(flagModelsType)
	filterOS := strings.ToLower(flagModelsOS)

	for _, m := range catalog.Models {
		os := modelOS(m.Engine, m.Platforms)

		if filterType != "" && m.Type != filterType {
			continue
		}
		if filterOS != "" && !strings.Contains(os, filterOS) {
			continue
		}
		if flagModelsMaxVRAM > 0 && m.VRAM != nil {
			totalMB := m.VRAM.Model + m.VRAM.Overhead
			if totalMB > flagModelsMaxVRAM*1024 {
				continue
			}
		}

		repo := m.Repo
		if m.Bits != nil {
			repo = fmt.Sprintf("%s:%dbit", repo, *m.Bits)
		}

		fmt.Printf("%s | %s | %s | %s | %s | %s\n",
			m.Type, os, formatVRAM(m.VRAM), formatContext(m.Defaults), repo, m.Name)
	}

	return nil
}
