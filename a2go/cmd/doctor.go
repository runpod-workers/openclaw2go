package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"github.com/runpod-labs/a2go/a2go/internal/docker"
	"github.com/runpod-labs/a2go/a2go/internal/download"
	"github.com/runpod-labs/a2go/a2go/internal/paths"
	"github.com/runpod-labs/a2go/a2go/internal/platform"
	"github.com/runpod-labs/a2go/a2go/internal/preflight"
	"github.com/runpod-labs/a2go/a2go/internal/ui"
	"github.com/runpod-labs/a2go/a2go/internal/venv"
)

const dockerImage = "runpod/a2go:latest"

var doctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Check prerequisites and install dependencies",
	Long:  "Verifies your system, installs dependencies, and prepares your environment. Safe to re-run.",
	RunE:  runDoctor,
}

func runDoctor(cmd *cobra.Command, args []string) error {
	if platform.UseDockerBackend() {
		return runDoctorDocker(cmd, args)
	}
	return runDoctorMlx(cmd, args)
}

func runDoctorDocker(cmd *cobra.Command, args []string) error {
	ui.Banner("agent2go — Doctor")
	fmt.Printf("  Platform: %s\n", platform.Description())
	fmt.Println("  Backend:  Docker")

	// Step 1: Preflight checks
	ui.Step(1, "Checking prerequisites")
	results, allOk := preflight.RunDocker()
	preflight.PrintResults(results)
	if !allOk {
		return fmt.Errorf("prerequisites not met — fix the issues above and re-run")
	}

	// Step 2: Directories
	ui.Step(2, "Creating directories")
	dirs := []string{
		paths.InstallDir,
	}
	for _, d := range dirs {
		if err := os.MkdirAll(d, 0755); err != nil {
			return fmt.Errorf("failed to create directories: %w", err)
		}
	}
	ui.Ok(paths.InstallDir)

	// Step 3: Pull Docker image
	ui.Step(3, "Pulling Docker image")
	fmt.Printf("      %s\n", dockerImage)
	if err := docker.PullImage(dockerImage); err != nil {
		arch := platform.Description()
		return fmt.Errorf("docker pull failed for %s. if the image has no manifest for this platform, try pulling the arch-specific tag: docker pull %s-%s\n%w",
			arch, dockerImage, strings.SplitN(arch, "/", 2)[1], err)
	}
	ui.Ok("image ready")

	// Done
	ui.Banner("Doctor Complete!")
	fmt.Println()
	fmt.Println("  Next: start your stack")
	fmt.Println()
	fmt.Println("    a2go start --llm unsloth/GLM-4.7-Flash-GGUF:4bit")
	fmt.Println()
	fmt.Println("  With image generation:")
	fmt.Println()
	fmt.Println("    a2go start --llm unsloth/GLM-4.7-Flash-GGUF:4bit --image disty0/flux2-klein-sdnq")
	fmt.Println()
	return nil
}

func runDoctorMlx(cmd *cobra.Command, args []string) error {
	ui.Banner("agent2go — Doctor")
	fmt.Printf("  Platform: %s\n", platform.Description())
	fmt.Println("  Backend:  MLX (native)")

	if !platform.IsMacAppleSilicon() {
		return fmt.Errorf("apple Silicon (arm64) required — detected %s", platform.Description())
	}

	// Step 1: Preflight checks
	ui.Step(1, "Checking prerequisites")
	results, allOk := preflight.RunAll()
	preflight.PrintResults(results)
	if !allOk {
		return fmt.Errorf("prerequisites not met — fix the issues above and re-run")
	}

	// Step 2: Directory structure
	ui.Step(2, "Creating directories")
	if err := paths.EnsureAll(); err != nil {
		return fmt.Errorf("failed to create directories: %w", err)
	}
	ui.Ok(paths.InstallDir)

	// Step 3: Python venv + packages
	ui.Step(3, "Setting up Python environment")
	if err := venv.Create(); err != nil {
		return fmt.Errorf("failed to create venv: %w", err)
	}
	if err := venv.PipInstall("mlx-lm", "mlx-audio", "mflux"); err != nil {
		return fmt.Errorf("pip install failed: %w", err)
	}
	ui.Ok("mlx-lm, mlx-audio, mflux installed")

	// Step 4: Download scripts
	ui.Step(4, "Downloading scripts")
	scripts := []struct {
		remote string
		local  string
	}{
		{"scripts/mflux-server", filepath.Join(paths.Bin(), "mflux-server")},
		{"scripts/openclaw-image-gen", filepath.Join(paths.Bin(), "openclaw-image-gen")},
	}
	for _, s := range scripts {
		if err := download.File(s.remote, s.local, true); err != nil {
			return fmt.Errorf("download %s: %w", s.remote, err)
		}
	}
	ui.Ok("scripts installed to " + paths.Bin())

	// Step 5: Download skill
	ui.Step(5, "Installing image-gen skill")
	skillPath := filepath.Join(paths.SkillImageGen(), "SKILL.md")
	if err := download.FileWithReplace(
		"openclaw/skills/image-gen/SKILL.md", skillPath,
		"/workspace/openclaw/images/", "~/.a2go/images/",
	); err != nil {
		return fmt.Errorf("download skill: %w", err)
	}
	ui.Ok("image-gen skill installed")

	// Step 6: Install OpenClaw
	ui.Step(6, "Installing OpenClaw")
	npmCmd := exec.Command("npm", "install", "-g", "openclaw@latest")
	npmCmd.Stdout = os.Stdout
	npmCmd.Stderr = os.Stderr
	if err := npmCmd.Run(); err != nil {
		return fmt.Errorf("npm install openclaw failed: %w", err)
	}
	ui.Ok("openclaw installed")

	// Done
	ui.Banner("Doctor Complete!")
	fmt.Println()
	fmt.Println("  Next: start your stack")
	fmt.Println()
	fmt.Println("    a2go start --llm mlx-community/Qwen3-30B-A3B-4bit")
	fmt.Println()
	fmt.Println("  With image generation:")
	fmt.Println()
	fmt.Println("    a2go start --llm mlx-community/Qwen3-30B-A3B-4bit --image mlx-community/FLUX.1-schnell-4bit-quantized")
	fmt.Println()
	return nil
}
