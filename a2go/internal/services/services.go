package services

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/runpod-labs/a2go/a2go/internal/paths"
	"github.com/runpod-labs/a2go/a2go/internal/process"
	"github.com/runpod-labs/a2go/a2go/internal/ui"
)

type Service struct {
	Name string
	Port int
}

var (
	LLM            = Service{"llm", 8000}
	Media          = Service{"media", 8001}
	WebProxy       = Service{"web-proxy", 8080}
	Gateway        = Service{"gateway", 18789}
	HermesGateway  = Service{"hermes-gateway", 8642}

	// Deprecated: use Media instead. Kept for backward compat in macOS MLX mode.
	Audio          = Service{"audio", 8001}
	Image          = Service{"image", 8002}

	All = []Service{LLM, Media, WebProxy, Gateway, HermesGateway}
)

// GatewayFor returns the gateway service for the given agent framework.
func GatewayFor(agent string) Service {
	if agent == "hermes" {
		return HermesGateway
	}
	return Gateway
}

func venvEnv() []string {
	env := os.Environ()
	venvBin := paths.VenvBin()
	binDir := paths.Bin()
	newPath := fmt.Sprintf("%s:%s:%s", venvBin, binDir, os.Getenv("PATH"))
	result := make([]string, 0, len(env)+2)
	for _, e := range env {
		if len(e) > 5 && e[:5] == "PATH=" {
			continue
		}
		result = append(result, e)
	}
	result = append(result, "PATH="+newPath)
	result = append(result, "A2GO_IMAGE_OUTPUT_DIR="+paths.Images())
	return result
}

func logFile(name string) (*os.File, error) {
	return os.OpenFile(filepath.Join(paths.Logs(), name+".log"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
}

func startProcess(svc Service, name string, args []string, extraEnv ...string) (int, error) {
	ui.Info(fmt.Sprintf("starting %s on :%d ...", svc.Name, svc.Port))

	f, err := logFile(svc.Name)
	if err != nil {
		return 0, fmt.Errorf("could not open log: %w", err)
	}

	cmd := exec.Command(name, args...)
	cmd.Stdout = f
	cmd.Stderr = f
	cmd.Env = append(venvEnv(), extraEnv...)

	if err := cmd.Start(); err != nil {
		f.Close()
		return 0, fmt.Errorf("failed to start %s: %w", svc.Name, err)
	}

	pid := cmd.Process.Pid
	process.SavePid(svc.Name, pid)

	// Release the process so it isn't reaped when this goroutine returns
	go func() {
		cmd.Wait()
		f.Close()
	}()

	return pid, nil
}

// PreDownloadModel downloads a HuggingFace model before starting the server.
// This avoids the multiprocessing semaphore leak that crashes mlx_lm.server
// when it tries to download models internally.
func PreDownloadModel(model string) error {
	ui.Info(fmt.Sprintf("checking model cache (%s)...", model))
	cmd := exec.Command(paths.VenvPython(), "-c", fmt.Sprintf(
		`from huggingface_hub import snapshot_download; snapshot_download("%s")`, model))
	cmd.Env = append(venvEnv(), "HF_HUB_DISABLE_PROGRESS_BARS=0")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to download model %s: %w", model, err)
	}
	return nil
}

func StartLLM(model string, contextLength int) (int, error) {
	return startProcess(LLM, paths.VenvPython(), []string{
		"-m", "mlx_lm", "server",
		"--model", model,
		"--host", "0.0.0.0",
		"--port", "8000",
		"--max-tokens", fmt.Sprintf("%d", contextLength),
	})
}

func StartAudio(model string) (int, error) {
	// LFM2.5 uses a custom server because mlx-audio's category detection
	// doesn't support the STS category where the model lives.
	if strings.Contains(strings.ToLower(model), "lfm2") {
		return startProcess(Audio, paths.VenvPython(), []string{
			filepath.Join(paths.Bin(), "mlx-lfm2-server"),
			"--model", model,
			"--host", "0.0.0.0",
			"--port", "8001",
		})
	}
	return startProcess(Audio, paths.VenvPython(), []string{
		"-m", "mlx_audio.server",
		"--host", "0.0.0.0",
		"--port", "8001",
	})
}

func StartImage(model string) (int, error) {
	return startProcess(Image, filepath.Join(paths.Bin(), "mflux-server"), []string{
		"--model", model,
		"--port", "8002",
	})
}

func StartWandler(model string, apiKey string) (int, error) {
	args := []string{
		"--llm", model,
		"--port", fmt.Sprintf("%d", LLM.Port),
		"--host", "0.0.0.0",
	}
	if apiKey != "" {
		args = append(args, "--api-key", apiKey)
	}
	return startProcess(LLM, "wandler", args)
}

func StartWebProxy(audioDir string, audioModel string) (int, error) {
	args := []string{
		filepath.Join(paths.Bin(), "web-proxy"),
		"--port", "8080",
		"--audio-dir", audioDir,
	}
	if audioModel != "" {
		args = append(args, "--audio-model", audioModel)
	}
	return startProcess(WebProxy, "node", args)
}

func StartGateway(authToken string) (int, error) {
	stateDir := paths.OpenClawState()
	return startProcess(Gateway, "openclaw", []string{
		"gateway", "--auth", "token", "--token", authToken,
	},
		"OPENCLAW_STATE_DIR="+stateDir,
		"A2GO_GATEWAY_TOKEN="+authToken,
	)
}

func resolveHermesBinary() string {
	// Check PATH first
	if p, err := exec.LookPath("hermes"); err == nil {
		return p
	}
	// Fallback to known install locations
	home := os.Getenv("HOME")
	for _, candidate := range []string{
		filepath.Join(home, ".local", "bin", "hermes"),
		filepath.Join(home, ".hermes", "hermes-agent", "venv", "bin", "hermes"),
	} {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return "hermes" // let it fail with a clear error
}

func StartHermesGateway(authToken string) (int, error) {
	// Hermes blocklists "changeme" and other placeholders in has_usable_secret().
	// Use the same non-blocked key that hermes.GenerateConfig() writes.
	apiKey := authToken
	blocked := map[string]bool{
		"changeme": true, "placeholder": true, "dummy": true, "example": true,
	}
	if blocked[strings.ToLower(apiKey)] {
		apiKey = "a2go-local-" + apiKey
	}
	return startProcess(HermesGateway, resolveHermesBinary(), []string{"gateway", "run"},
		"OPENAI_API_KEY="+apiKey,
		"OPENAI_BASE_URL=http://localhost:8000/v1",
		"API_SERVER_ENABLED=true",
		"API_SERVER_PORT=8642",
		"API_SERVER_HOST=0.0.0.0",
		"API_SERVER_KEY="+authToken,
	)
}
