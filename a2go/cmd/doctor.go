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

	// Step 3: Pull Docker image (always try to get latest; fall back to local)
	ui.Step(3, "Pulling Docker image")
	fmt.Printf("      %s\n", dockerImage)
	if err := docker.PullImage(dockerImage); err != nil {
		if docker.ImageExists(dockerImage) {
			fmt.Printf("      pull failed (%v), using existing local image\n", err)
			ui.Ok("image ready (local)")
		} else {
			arch := platform.Description()
			return fmt.Errorf("docker pull failed for %s. if the image has no manifest for this platform, try pulling the arch-specific tag: docker pull %s-%s\n%w",
				arch, dockerImage, strings.SplitN(arch, "/", 2)[1], err)
		}
	} else {
		ui.Ok("image ready")
	}

	// Done
	ui.Banner("Doctor Complete!")
	fmt.Println()
	fmt.Println("  Next: run your stack")
	fmt.Println()
	fmt.Println("    a2go run --agent openclaw --llm unsloth/GLM-4.7-Flash-GGUF:4bit")
	fmt.Println()
	fmt.Println("  With image generation:")
	fmt.Println()
	fmt.Println("    a2go run --agent openclaw --llm unsloth/GLM-4.7-Flash-GGUF:4bit --image Disty0/FLUX.2-klein-4B-SDNQ-4bit-dynamic")
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
	// Install mlx-audio/mflux first, then upgrade mlx-lm last.
	// mlx-audio can pin an older mlx-lm (e.g. ==0.31.1) which would
	// downgrade it if installed after. Installing mlx-lm last with
	// --upgrade ensures we always get the latest version.
	if err := venv.PipInstall("mlx-audio", "mflux", "uvicorn", "fastapi", "python-multipart"); err != nil {
		return fmt.Errorf("pip install failed: %w", err)
	}
	if err := venv.PipInstall("mlx-lm"); err != nil {
		return fmt.Errorf("pip install mlx-lm failed: %w", err)
	}
	ui.Ok("mlx-lm, mlx-audio, mflux installed")

	// Step 4: Download scripts
	ui.Step(4, "Downloading scripts")
	scripts := []struct {
		remote string
		local  string
	}{
		{"scripts/mflux-server", filepath.Join(paths.Bin(), "mflux-server")},
		{"scripts/mlx-lfm2-server", filepath.Join(paths.Bin(), "mlx-lfm2-server")},
		{"scripts/web-proxy", filepath.Join(paths.Bin(), "web-proxy")},
	}
	for _, s := range scripts {
		if err := download.File(s.remote, s.local, true); err != nil {
			return fmt.Errorf("download %s: %w", s.remote, err)
		}
	}
	ui.Ok("scripts installed to " + paths.Bin())

	// Step 5: Download skills
	ui.Step(5, "Installing skills")
	skills := []struct {
		remote string
		local  string
	}{
		{"config/workspace/skills/a2go-image-generate/SKILL.md", filepath.Join(paths.SkillImageGenerate(), "SKILL.md")},
		{"config/workspace/skills/a2go-text-to-speech/SKILL.md", filepath.Join(paths.SkillTextToSpeech(), "SKILL.md")},
		{"config/workspace/skills/a2go-speech-to-text/SKILL.md", filepath.Join(paths.SkillSpeechToText(), "SKILL.md")},
	}
	for _, s := range skills {
		if err := download.File(s.remote, s.local, false); err != nil {
			return fmt.Errorf("download skill %s: %w", s.remote, err)
		}
	}
	ui.Ok("skills installed")

	// Step 6: Install OpenClaw
	ui.Step(6, "Installing OpenClaw")
	npmCmd := exec.Command("npm", "install", "-g", "openclaw@latest")
	npmCmd.Stdout = os.Stdout
	npmCmd.Stderr = os.Stderr
	if err := npmCmd.Run(); err != nil {
		return fmt.Errorf("npm install openclaw failed: %w", err)
	}
	ui.Ok("openclaw installed")

	// Step 7: Install Hermes
	ui.Step(7, "Installing Hermes")
	if _, err := exec.LookPath("hermes"); err != nil {
		hermesInstall := exec.Command("bash", "-c", "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash")
		hermesInstall.Stdout = os.Stdout
		hermesInstall.Stderr = os.Stderr
		if err := hermesInstall.Run(); err != nil {
			fmt.Println("      WARNING: hermes install failed — hermes agent will not be available")
			fmt.Printf("      %v\n", err)
		} else {
			ui.Ok("hermes installed")
		}
	} else {
		ui.Ok("hermes already installed")
	}

	// Done
	ui.Banner("Doctor Complete!")
	fmt.Println()
	fmt.Println("  Next: run your stack")
	fmt.Println()
	fmt.Println("    a2go run --agent openclaw --llm mlx-community/Qwen3-30B-A3B-4bit")
	fmt.Println()
	fmt.Println("  With image generation:")
	fmt.Println()
	fmt.Println("    a2go run --agent openclaw --llm mlx-community/Qwen3-30B-A3B-4bit --image mlx-community/FLUX.1-schnell-4bit-quantized")
	fmt.Println()
	return nil
}
