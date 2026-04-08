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

	"github.com/runpod-labs/a2go/a2go/internal/catalog"
	"github.com/runpod-labs/a2go/a2go/internal/config"
	"github.com/runpod-labs/a2go/a2go/internal/docker"
	"github.com/runpod-labs/a2go/a2go/internal/health"
	"github.com/runpod-labs/a2go/a2go/internal/hermes"
	"github.com/runpod-labs/a2go/a2go/internal/openclaw"
	"github.com/runpod-labs/a2go/a2go/internal/paths"
	"github.com/runpod-labs/a2go/a2go/internal/platform"
	"github.com/runpod-labs/a2go/a2go/internal/process"
	"github.com/runpod-labs/a2go/a2go/internal/services"
	"github.com/runpod-labs/a2go/a2go/internal/ui"
	"github.com/runpod-labs/a2go/a2go/internal/venv"
)

var (
	flagAgent  string
	flagLLM    string
	flagImage  string
	flagAudio  string
	flagToken  string
	flagConfig string
)

var runCmd = &cobra.Command{
	Use:   "run",
	Short: "Run all services",
	Long: `Run LLM, audio, image servers and an agent gateway.

Using flags (recommended):
  a2go run --agent openclaw --llm unsloth/GLM-4.7-Flash-GGUF:4bit
  a2go run --agent hermes --llm unsloth/GLM-4.7-Flash-GGUF:4bit --audio LiquidAI/LFM2.5-Audio-1.5B-GGUF:4bit

Using JSON (same format as Docker A2GO_CONFIG):
  a2go run --config '{"agent":"openclaw","llm":"unsloth/GLM-4.7-Flash-GGUF:4bit"}'

Or set A2GO_CONFIG environment variable.`,
	Args: cobra.NoArgs,
	RunE: execRun,
}

func init() {
	runCmd.Flags().StringVar(&flagAgent, "agent", "", "Agent framework (required): openclaw, hermes")
	runCmd.MarkFlagRequired("agent")
	runCmd.Flags().StringVar(&flagLLM, "llm", "", "LLM model (e.g. unsloth/GLM-4.7-Flash-GGUF:4bit)")
	runCmd.Flags().StringVar(&flagImage, "image", "", "Image model (e.g. Disty0/FLUX.2-klein-4B-SDNQ-4bit-dynamic)")
	runCmd.Flags().StringVar(&flagAudio, "audio", "", "Audio model (e.g. LiquidAI/LFM2.5-Audio-1.5B-GGUF:4bit, or 'off' to disable)")
	runCmd.Flags().StringVar(&flagToken, "token", "changeme", "Auth token for gateway")
	runCmd.Flags().StringVar(&flagConfig, "config", "", "JSON config (same format as Docker A2GO_CONFIG)")
}

func resolveConfig() (*config.Config, error) {
	// Priority: flags > --config > env var
	if flagLLM != "" {
		if err := config.ValidateAgent(flagAgent); err != nil {
			return nil, err
		}
		cfg := &config.Config{
			Agent:     flagAgent,
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
		return nil, fmt.Errorf("model required\n\n  a2go run --agent openclaw --llm unsloth/GLM-4.7-Flash-GGUF:4bit\n  a2go run --agent hermes --llm <llm-model> --audio <audio-model>\n\n  or with JSON: a2go run --config '{\"agent\":\"openclaw\",\"llm\":\"unsloth/GLM-4.7-Flash-GGUF:4bit\"}'")
	}

	cfg, err := config.Parse(raw)
	if err != nil {
		return nil, err
	}

	// --agent flag overrides JSON agent field
	if flagAgent != "" {
		if err := config.ValidateAgent(flagAgent); err != nil {
			return nil, err
		}
		cfg.Agent = flagAgent
	}

	if cfg.Agent == "" {
		return nil, fmt.Errorf("agent is required — pass --agent openclaw or --agent hermes")
	}

	return cfg, nil
}

func execRun(cmd *cobra.Command, args []string) error {
	cfg, err := resolveConfig()
	if err != nil {
		return err
	}

	if platform.UseDockerBackend() {
		return execRunDocker(cfg)
	}
	return execRunMlx(cfg)
}

const containerName = "a2go"

func execRunDocker(cfg *config.Config) error {
	// Check Docker image exists
	if !docker.ImageExists(dockerImage) {
		return fmt.Errorf("docker image not found: %s. run: a2go doctor", dockerImage)
	}

	// Validate model names against catalog (fast-fail instead of 600s timeout)
	if err := validateModels(cfg); err != nil {
		return err
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

	// Check ports free — gateway port depends on agent
	gwSvc := services.GatewayFor(cfg.Agent)
	gwPort := gwSvc.Port
	gwName := gwSvc.Name
	portChecks := []struct {
		port int
		name string
	}{
		{8000, "LLM"},
		{8080, "Web Proxy"},
		{gwPort, gwName},
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
	ui.Banner(fmt.Sprintf("agent2go — Starting (Docker, %s)", cfg.Agent))
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
			"A2GO_CONFIG":     configJSON,
			"A2GO_AUTH_TOKEN":  cfg.GetAuthToken(),
			"LLAMACPP_API_KEY": cfg.GetAuthToken(),
		},
		Ports: []string{
			"8000:8000",
			"8080:8080",
			fmt.Sprintf("%d:%d", gwPort, gwPort),
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
		return fmt.Errorf("LLM server failed to start. container has been removed. check the logs above and retry: a2go run --llm %s", cfg.LLM.Model)
	}
	ui.Ok("LLM server ready")

	// Model name for display
	modelName := cfg.LLM.Model
	if idx := strings.LastIndex(modelName, "/"); idx >= 0 {
		modelName = modelName[idx+1:]
	}

	// Ready banner
	ui.Banner(fmt.Sprintf("agent2go — Ready! (%s)", cfg.Agent))
	fmt.Println()
	fmt.Printf("  LLM:     http://localhost:8000  (%s)\n", modelName)
	fmt.Println("  Web:     http://localhost:8080")
	fmt.Printf("  Gateway: http://localhost:%d  (%s)\n", gwPort, cfg.Agent)
	fmt.Println()
	fmt.Println("  Logs: docker logs -f a2go")
	fmt.Println()
	fmt.Println("  a2go status    check services")
	fmt.Println("  a2go stop      stop all")
	fmt.Println()
	return nil
}

// validateModels checks that all configured models exist in the catalog.
// This lets us fast-fail before starting a Docker container instead of waiting
// through a 600s health-check timeout for an invalid model.
func validateModels(cfg *config.Config) error {
	data, err := catalog.Fetch(catalogURL, 10*time.Second)
	if err != nil {
		// Can't fetch catalog — skip validation rather than blocking
		return nil
	}
	var cat struct {
		Models []struct {
			Repo string `json:"repo"`
		} `json:"models"`
	}
	if err := json.Unmarshal(data, &cat); err != nil {
		return nil
	}
	repos := make(map[string]bool, len(cat.Models))
	for _, m := range cat.Models {
		repos[strings.ToLower(m.Repo)] = true
	}

	check := func(label, model string) error {
		slug := config.ModelSlug(model) // strip :Nbit suffix
		if repos[strings.ToLower(slug)] {
			return nil
		}
		return fmt.Errorf("unknown %s model: %s\n  Run 'a2go models --type %s' to see available models", label, model, label)
	}

	if cfg.LLM != nil {
		if err := check("llm", cfg.LLM.Model); err != nil {
			return err
		}
	}
	if cfg.Image != nil && cfg.Image.Model != "" {
		if err := check("image", cfg.Image.Model); err != nil {
			return err
		}
	}
	if cfg.Audio != nil && cfg.Audio.Model != "" {
		if err := check("audio", cfg.Audio.Model); err != nil {
			return err
		}
	}
	return nil
}

func buildDockerConfigJSON(cfg *config.Config) string {
	m := map[string]interface{}{}
	m["agent"] = cfg.Agent
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

func execRunMlx(cfg *config.Config) error {
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

	// Check ports — gateway port depends on agent
	mlxGwSvc := services.GatewayFor(cfg.Agent)
	portChecks := []struct {
		port int
		name string
	}{
		{services.LLM.Port, "LLM"},
		{services.WebProxy.Port, "Web Proxy"},
		{mlxGwSvc.Port, mlxGwSvc.Name},
	}
	if cfg.Image != nil && cfg.Image.Model != "" {
		portChecks = append(portChecks, struct {
			port int
			name string
		}{services.Image.Port, "Image"})
	}
	if cfg.AudioEnabled() {
		portChecks = append(portChecks, struct {
			port int
			name string
		}{services.Audio.Port, "Audio"})
	}
	for _, pc := range portChecks {
		if process.PortListening(pc.port) {
			return fmt.Errorf("port %d already in use (needed for %s)\n\n  a2go stop    stop previous session\n  lsof -iTCP:%d -sTCP:LISTEN    see what's using it", pc.port, pc.name, pc.port)
		}
	}

	// Save config for restart
	config.Save(cfg)

	// Banner
	ui.Banner(fmt.Sprintf("agent2go — Starting (%s)", cfg.Agent))
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

	// Strip :quant suffix — MLX uses bare HuggingFace slugs
	llmModel := config.ModelSlug(cfg.LLM.Model)
	audioModel := ""
	if cfg.Audio != nil && cfg.Audio.Model != "" {
		audioModel = config.ModelSlug(cfg.Audio.Model)
	}

	// Start LLM
	llmPid, err := services.StartLLM(llmModel)
	if err != nil {
		return err
	}
	pids = append(pids, llmPid)

	// Start Audio (optional)
	if cfg.AudioEnabled() && venv.PythonCanImport("mlx_audio") && !process.PortListening(services.Audio.Port) {
		pid, err := services.StartAudio(audioModel)
		if err == nil {
			pids = append(pids, pid)
		}
	}

	// Start Image (optional)
	var imagePid int
	if cfg.Image != nil && cfg.Image.Model != "" {
		imagePid, err = services.StartImage(config.ModelSlug(cfg.Image.Model))
		if err != nil {
			return err
		}
		pids = append(pids, imagePid)
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

	// Wait for Image health (if started)
	if imagePid > 0 {
		ui.Info("waiting for image server...")
		imgAlive := func() bool { return process.IsAlive(imagePid) }
		if err := health.WaitForReady(fmt.Sprintf("http://localhost:%d/health", services.Image.Port), imgAlive, 120*time.Second); err != nil {
			ui.Fail(fmt.Sprintf("image server: %v", err))
			fmt.Printf("      Check logs: %s/image.log\n", paths.Logs())
			cleanup()
			return fmt.Errorf("image server failed to start")
		}
		ui.Ok("image server ready")
	}

	// Start web proxy
	wpPid, err := services.StartWebProxy(paths.Audio(), audioModel)
	if err != nil {
		return err
	}
	pids = append(pids, wpPid)

	// Agent-specific config generation and gateway startup
	switch cfg.Agent {
	case "openclaw":
		ui.Info("generating openclaw config...")
		hasImage := cfg.Image != nil && cfg.Image.Model != ""
		if err := openclaw.GenerateConfig(cfg.LLM.Model, cfg.GetContextLength(), cfg.GetAuthToken(), hasImage); err != nil {
			return fmt.Errorf("failed to generate openclaw.json: %w", err)
		}
		ui.Ok(paths.OpenClawState() + "/openclaw.json")

		gwPid, err := services.StartGateway(cfg.GetAuthToken())
		if err != nil {
			return err
		}
		pids = append(pids, gwPid)

	case "hermes":
		ui.Info("generating hermes config...")
		if err := hermes.GenerateConfig(cfg.LLM.Model, cfg.GetContextLength(), cfg.GetAuthToken()); err != nil {
			return fmt.Errorf("failed to generate hermes config: %w", err)
		}
		ui.Ok(paths.HermesState() + "/config.yaml")

		gwPid, err := services.StartHermesGateway(cfg.GetAuthToken())
		if err != nil {
			return err
		}
		pids = append(pids, gwPid)
	}

	// Model name for display
	modelName := cfg.LLM.Model
	if idx := strings.LastIndex(modelName, "/"); idx >= 0 {
		modelName = modelName[idx+1:]
	}

	// Ready banner
	ui.Banner(fmt.Sprintf("agent2go — Ready! (%s)", cfg.Agent))
	fmt.Println()
	fmt.Printf("  API:     http://localhost:8080  (%s)\n", modelName)
	fmt.Printf("  Gateway: http://localhost:%d  (%s)\n", mlxGwSvc.Port, cfg.Agent)
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
