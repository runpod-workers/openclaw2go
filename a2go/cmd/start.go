package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/runpod-labs/a2go/a2go/internal/config"
	"github.com/runpod-labs/a2go/a2go/internal/docker"
	"github.com/runpod-labs/a2go/a2go/internal/health"
	"github.com/runpod-labs/a2go/a2go/internal/openclaw"
	"github.com/runpod-labs/a2go/a2go/internal/paths"
	"github.com/runpod-labs/a2go/a2go/internal/platform"
	"github.com/runpod-labs/a2go/a2go/internal/process"
	"github.com/runpod-labs/a2go/a2go/internal/services"
	"github.com/runpod-labs/a2go/a2go/internal/ui"
	"github.com/runpod-labs/a2go/a2go/internal/venv"
)

var (
	flagLLM    string
	flagImage  string
	flagAudio  string
	flagToken  string
	flagConfig string
)

var startCmd = &cobra.Command{
	Use:   "start",
	Short: "Start all services",
	Long: `Start LLM, audio, image servers and the OpenClaw gateway.

Using flags (recommended):
  a2go start --llm unsloth/GLM-4.7-Flash-GGUF:4bit
  a2go start --llm unsloth/GLM-4.7-Flash-GGUF:4bit --audio LiquidAI/LFM2.5-Audio-1.5B-GGUF:4bit

Using JSON (same format as Docker A2GO_CONFIG):
  a2go start --config '{"llm":"unsloth/GLM-4.7-Flash-GGUF:4bit"}'

Or set A2GO_CONFIG environment variable.`,
	Args: cobra.NoArgs,
	RunE: runStart,
}

func init() {
	startCmd.Flags().StringVar(&flagLLM, "llm", "", "LLM model (e.g. unsloth/GLM-4.7-Flash-GGUF:4bit)")
	startCmd.Flags().StringVar(&flagImage, "image", "", "Image model (e.g. disty0/flux2-klein-sdnq)")
	startCmd.Flags().StringVar(&flagAudio, "audio", "", "Audio model (e.g. LiquidAI/LFM2.5-Audio-1.5B-GGUF:4bit, or 'off' to disable)")
	startCmd.Flags().StringVar(&flagToken, "token", "changeme", "Auth token for OpenClaw gateway")
	startCmd.Flags().StringVar(&flagConfig, "config", "", "JSON config (same format as Docker A2GO_CONFIG)")
}

func resolveConfig() (*config.Config, error) {
	// Priority: flags > --config > env var
	if flagLLM != "" {
		cfg := &config.Config{
			LLM:       &config.ServiceConfig{Model: flagLLM},
			AuthToken: flagToken,
		}
		if flagImage != "" {
			cfg.Image = &config.ServiceConfig{Model: flagImage}
		}
		if flagAudio == "off" {
			f := false
			cfg.Audio = &config.AudioConfig{Enabled: &f}
		} else if flagAudio != "" {
			cfg.Audio = &config.AudioConfig{Model: flagAudio}
		}
		return cfg, nil
	}

	raw := flagConfig
	if raw == "" {
		raw = os.Getenv("A2GO_CONFIG")
	}
	if raw == "" {
		return nil, fmt.Errorf("model required\n\n  a2go start --llm unsloth/GLM-4.7-Flash-GGUF:4bit\n  a2go start --llm <llm-model> --audio <audio-model>\n\n  or with JSON: a2go start --config '{\"llm\":\"unsloth/GLM-4.7-Flash-GGUF:4bit\"}'")
	}

	return config.Parse(raw)
}

func runStart(cmd *cobra.Command, args []string) error {
	cfg, err := resolveConfig()
	if err != nil {
		return err
	}

	if platform.UseDockerBackend() {
		return runStartDocker(cfg)
	}
	return runStartMlx(cfg)
}

const containerName = "a2go"

func runStartDocker(cfg *config.Config) error {
	// Check Docker image exists
	if !docker.ImageExists(dockerImage) {
		return fmt.Errorf("docker image not found: %s. run: a2go doctor", dockerImage)
	}

	// Check no container already running
	status := docker.ContainerStatus(containerName)
	if status == "running" {
		return fmt.Errorf("container %q is already running. run: a2go status (check services) or a2go stop (stop first)", containerName)
	}

	// Remove stopped/exited container if it exists
	if status != "" {
		docker.RemoveContainer(containerName)
	}

	// Check ports free
	portChecks := []struct {
		port int
		name string
	}{
		{8000, "LLM"},
		{8080, "Web Proxy"},
		{18789, "Gateway"},
	}
	for _, pc := range portChecks {
		if process.PortListening(pc.port) {
			return fmt.Errorf("port %d already in use (needed for %s). this port is held by another process or container (not managed by a2go). find it: lsof -iTCP:%d -sTCP:LISTEN or docker ps --filter publish=%d. stop that process first, then retry", pc.port, pc.name, pc.port, pc.port)
		}
	}

	// Save config for restart
	config.Save(cfg)

	// Build A2GO_CONFIG JSON
	configJSON := buildDockerConfigJSON(cfg)

	// Banner
	ui.Banner("agent2go — Starting (Docker)")
	fmt.Printf("  LLM:   %s\n", cfg.LLM.Model)
	if cfg.Image != nil && cfg.Image.Model != "" {
		fmt.Printf("  Image: %s\n", cfg.Image.Model)
	}

	// Data volume for persistent storage
	home := os.Getenv("HOME")
	if home == "" {
		home = "/root"
	}
	dataVolume := filepath.Join(home, ".openclaw-data") + ":/workspace"

	// Run container
	ui.Info("starting container...")
	containerID, err := docker.RunContainer(docker.ContainerOpts{
		Image: dockerImage,
		Name:  containerName,
		GPUs:  "all",
		Env: map[string]string{
			"A2GO_CONFIG":    configJSON,
			"OPENCLAW_WEB_PASSWORD": cfg.GetAuthToken(),
			"LLAMACPP_API_KEY":      cfg.GetAuthToken(),
		},
		Ports: []string{
			"8000:8000",
			"8080:8080",
			"18789:18789",
		},
		Volumes: []string{
			dataVolume,
		},
	})
	if err != nil {
		return fmt.Errorf("failed to start container: %w", err)
	}
	docker.SaveContainerID(containerID)
	ui.Ok(fmt.Sprintf("container %s started", containerID[:12]))

	// Health check — 10 min timeout to allow for model download on first run
	fmt.Println()
	ui.Info("waiting for LLM server (model may need to download on first run)...")
	isAlive := func() bool {
		return docker.ContainerStatus(containerName) == "running"
	}
	if err := health.WaitForReady("http://localhost:8000/health", isAlive, 600*time.Second); err != nil {
		ui.Fail(fmt.Sprintf("LLM server: %v", err))
		// Show container logs so agents and users can diagnose without running another command
		fmt.Println()
		fmt.Println("      --- container logs (last 30 lines) ---")
		if logs := docker.ContainerLogs(containerName, 30); logs != "" {
			fmt.Println(logs)
		} else {
			fmt.Println("      (no logs available)")
		}
		fmt.Println("      --- end logs ---")
		fmt.Println()
		// Clean up the failed container so the next start doesn't say "already running"
		docker.StopContainer(containerName)
		docker.RemoveContainer(containerName)
		docker.RemoveContainerIDFile()
		return fmt.Errorf("LLM server failed to start. container has been removed. check the logs above and retry: a2go start --llm %s", cfg.LLM.Model)
	}
	ui.Ok("LLM server ready")

	// Model name for display
	modelName := cfg.LLM.Model
	if idx := strings.LastIndex(modelName, "/"); idx >= 0 {
		modelName = modelName[idx+1:]
	}

	// Ready banner
	ui.Banner("agent2go — Ready!")
	fmt.Println()
	fmt.Printf("  LLM:     http://localhost:8000  (%s)\n", modelName)
	fmt.Println("  Web:     http://localhost:8080")
	fmt.Println("  Gateway: http://localhost:18789")
	fmt.Println()
	fmt.Println("  Logs: docker logs -f a2go")
	fmt.Println()
	fmt.Println("  a2go status    check services")
	fmt.Println("  a2go stop      stop all")
	fmt.Println()
	return nil
}

func buildDockerConfigJSON(cfg *config.Config) string {
	m := map[string]interface{}{}
	if cfg.LLM != nil {
		m["llm"] = cfg.LLM.Model
	}
	if cfg.Image != nil && cfg.Image.Model != "" {
		m["image"] = cfg.Image.Model
	}
	if cfg.Audio != nil {
		if cfg.Audio.Enabled != nil && !*cfg.Audio.Enabled {
			m["audio"] = map[string]interface{}{"enabled": false}
		} else if cfg.Audio.Model != "" {
			m["audio"] = cfg.Audio.Model
		}
	}
	if cfg.ContextLength != nil {
		m["contextLength"] = *cfg.ContextLength
	}
	data, _ := json.Marshal(m)
	return string(data)
}

func runStartMlx(cfg *config.Config) error {
	// Platform gate
	if !platform.IsMacAppleSilicon() {
		return fmt.Errorf("macOS Apple Silicon required — detected %s\nFor Linux/Windows, install the CLI and it will use Docker automatically.", platform.Description())
	}

	// Check venv exists
	if !venv.Exists() {
		return fmt.Errorf("not set up yet — run: a2go doctor")
	}

	// Check not already running
	if pid, err := process.ReadPid("llm"); err == nil && process.IsAlive(pid) {
		return fmt.Errorf("already running (LLM pid %d)\n\n  a2go status    check services\n  a2go stop      stop first", pid)
	}

	// Check ports
	portChecks := []struct {
		port int
		name string
	}{
		{services.LLM.Port, "LLM"},
		{services.Gateway.Port, "Gateway"},
	}
	if cfg.Image != nil && cfg.Image.Model != "" {
		portChecks = append(portChecks, struct {
			port int
			name string
		}{services.Image.Port, "Image"})
	}
	for _, pc := range portChecks {
		if process.PortListening(pc.port) {
			return fmt.Errorf("port %d already in use (needed for %s)\n\n  a2go stop    stop previous session\n  lsof -iTCP:%d -sTCP:LISTEN    see what's using it", pc.port, pc.name, pc.port)
		}
	}

	// Save config for restart
	config.Save(cfg)

	// Banner
	ui.Banner("agent2go — Starting")
	fmt.Printf("  LLM:   %s\n", cfg.LLM.Model)
	if cfg.Image != nil && cfg.Image.Model != "" {
		fmt.Printf("  Image: %s\n", cfg.Image.Model)
	}

	// Track PIDs for cleanup
	var pids []int
	cleanup := func() {
		fmt.Println()
		fmt.Println("Shutting down...")
		for _, pid := range pids {
			process.Kill(pid)
		}
		for _, svc := range services.All {
			process.RemovePidFile(svc.Name)
		}
		fmt.Println("All services stopped.")
	}

	// Signal handler
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		<-sigCh
		cleanup()
		os.Exit(0)
	}()

	// Start LLM
	llmPid, err := services.StartLLM(cfg.LLM.Model)
	if err != nil {
		return err
	}
	pids = append(pids, llmPid)

	// Start Audio (optional)
	audioPid := 0
	if cfg.AudioEnabled() && venv.PythonCanImport("mlx_audio") && !process.PortListening(services.Audio.Port) {
		pid, err := services.StartAudio()
		if err == nil {
			audioPid = pid
			pids = append(pids, pid)
		}
	}

	// Start Image (optional)
	imagePid := 0
	if cfg.Image != nil && cfg.Image.Model != "" {
		pid, err := services.StartImage(cfg.Image.Model)
		if err != nil {
			return err
		}
		imagePid = pid
		pids = append(pids, pid)
	}

	// Wait for LLM health
	fmt.Println()
	ui.Info("waiting for LLM server...")
	isAlive := func() bool { return process.IsAlive(llmPid) }
	if err := health.WaitForReady("http://localhost:8000/health", isAlive, 300*time.Second); err != nil {
		ui.Fail(fmt.Sprintf("LLM server: %v", err))
		fmt.Printf("      Check logs: %s/llm.log\n", paths.Logs())
		cleanup()
		return fmt.Errorf("LLM server failed to start")
	}
	ui.Ok("LLM server ready")

	// Generate openclaw.json
	ui.Info("generating openclaw config...")
	hasImage := cfg.Image != nil && cfg.Image.Model != ""
	if err := openclaw.GenerateConfig(cfg.LLM.Model, cfg.GetContextLength(), cfg.GetAuthToken(), hasImage); err != nil {
		return fmt.Errorf("failed to generate openclaw.json: %w", err)
	}
	ui.Ok(paths.OpenClawState() + "/openclaw.json")

	// Start gateway
	gwPid, err := services.StartGateway(cfg.GetAuthToken())
	if err != nil {
		return err
	}
	pids = append(pids, gwPid)

	// Model name for display
	modelName := cfg.LLM.Model
	if idx := strings.LastIndex(modelName, "/"); idx >= 0 {
		modelName = modelName[idx+1:]
	}

	// Ready banner
	ui.Banner("agent2go — Ready!")
	fmt.Println()
	fmt.Printf("  LLM:     http://localhost:8000  (%s)\n", modelName)
	if audioPid > 0 {
		fmt.Println("  Audio:   http://localhost:8001")
	}
	if imagePid > 0 {
		fmt.Println("  Image:   http://localhost:8002")
	}
	fmt.Println("  Gateway: http://localhost:18789")
	fmt.Println()
	fmt.Printf("  Logs: %s/\n", paths.Logs())
	fmt.Println()
	fmt.Println("  a2go status    check services")
	fmt.Println("  a2go stop      stop all")
	fmt.Println("  Ctrl+C          stop all")
	fmt.Println()

	// Wait forever (until signal)
	select {}
}
