package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/spf13/cobra"

	"github.com/runpod-labs/a2go/a2go/internal/config"
	"github.com/runpod-labs/a2go/a2go/internal/docker"
	"github.com/runpod-labs/a2go/a2go/internal/paths"
	"github.com/runpod-labs/a2go/a2go/internal/platform"
	"github.com/runpod-labs/a2go/a2go/internal/process"
	"github.com/runpod-labs/a2go/a2go/internal/services"
	"github.com/runpod-labs/a2go/a2go/internal/ui"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show running services",
	Run:   runStatus,
}

func runStatus(cmd *cobra.Command, args []string) {
	if platform.UseDockerBackend() {
		runStatusDocker()
	} else {
		runStatusMlx()
	}
}

func runStatusDocker() {
	fmt.Println()
	fmt.Println("agent2go — Service Status (Docker)")
	fmt.Println()

	status := docker.ContainerStatus(containerName)

	// Determine gateway port from saved config; fall back to OpenClaw default
	gwSvc := services.Gateway
	if savedCfg, err := config.LoadLast(); err == nil {
		gwSvc = services.GatewayFor(savedCfg.Agent)
	}

	switch status {
	case "running":
		ui.StatusLine("container", "running", containerName)
		// Check individual ports
		ports := []struct {
			name string
			port int
		}{
			{"llm", services.LLM.Port},
			{"web", services.WebProxy.Port},
			{gwSvc.Name, gwSvc.Port},
		}
		for _, p := range ports {
			if process.PortListening(p.port) {
				ui.StatusLine(p.name, "running", fmt.Sprintf("http://localhost:%d", p.port))
			} else {
				ui.StatusLine(p.name, "starting", fmt.Sprintf("port %d not yet listening", p.port))
			}
		}
		// Check media services via web proxy health endpoint
		if process.PortListening(services.WebProxy.Port) {
			showMediaServices()
		}
		fmt.Println()
		fmt.Println("  Logs: docker logs -f a2go")
		fmt.Println("  Stop: a2go stop")
	case "":
		ui.StatusLine("container", "stopped", "")
		// Check if ports are occupied by something else (not managed by a2go)
		occupied := []struct {
			name string
			port int
		}{
			{"llm", services.LLM.Port},
			{"web", services.WebProxy.Port},
			{gwSvc.Name, gwSvc.Port},
		}
		hasConflict := false
		for _, p := range occupied {
			if process.PortListening(p.port) {
				ui.StatusLine(p.name, "conflict", fmt.Sprintf("port %d in use by another process (not a2go)", p.port))
				hasConflict = true
			}
		}
		fmt.Println()
		if hasConflict {
			fmt.Println("  No a2go container running, but some ports are occupied.")
			fmt.Println("  Free those ports before starting: docker ps --filter publish=8000")
		} else {
			fmt.Println("  No services running.")
			fmt.Println("  Run: a2go run --llm <model>")
		}
	default:
		ui.StatusLine("container", status, containerName)
		fmt.Println()
		fmt.Println("  Container exists but is not running.")
		fmt.Println("  Run: a2go stop && a2go run --llm <model>")
	}

	fmt.Println()
}

func runStatusMlx() {
	fmt.Println()
	fmt.Println("agent2go — Service Status")
	fmt.Println()

	anyRunning := false
	for _, svc := range services.All {
		pid, pidErr := process.ReadPid(svc.Name)
		alive := pidErr == nil && process.IsAlive(pid)
		listening := process.PortListening(svc.Port)

		switch {
		case alive && listening:
			ui.StatusLine(svc.Name, "running", fmt.Sprintf("http://localhost:%d  (pid %d)", svc.Port, pid))
			anyRunning = true
		case listening:
			ui.StatusLine(svc.Name, "listening", fmt.Sprintf("http://localhost:%d  (external process)", svc.Port))
			anyRunning = true
		case alive:
			ui.StatusLine(svc.Name, "starting", fmt.Sprintf("pid %d (port %d not yet listening)", pid, svc.Port))
			anyRunning = true
		default:
			ui.StatusLine(svc.Name, "stopped", "")
		}
	}

	fmt.Println()
	if anyRunning {
		fmt.Printf("  Logs: %s/\n", paths.Logs())
		fmt.Println("  Stop: a2go stop")
	} else {
		fmt.Println("  No services running.")
		fmt.Println("  Run: a2go run --llm <model>")
	}
	fmt.Println()
}

// showMediaServices queries the web proxy /health endpoint to discover
// which media services (audio, image, tts, etc.) are active inside the container.
func showMediaServices() {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://localhost:%d/health", services.WebProxy.Port))
	if err != nil {
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return
	}
	// Docker media server returns: {"plugins":{"audio":{"status":"ok",...},...},"llm":{...}}
	// Mac web proxy returns: {"audio":{"ok":true,...},...}
	var result struct {
		Plugins map[string]json.RawMessage `json:"plugins"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return
	}
	for role, raw := range result.Plugins {
		var info struct {
			Status      string `json:"status"`
			ModelLoaded *bool  `json:"model_loaded"`
		}
		if err := json.Unmarshal(raw, &info); err != nil {
			continue
		}
		if info.Status == "ok" || (info.ModelLoaded != nil && *info.ModelLoaded) {
			ui.StatusLine(role, "running", fmt.Sprintf("via web proxy (:%d)", services.WebProxy.Port))
		} else {
			ui.StatusLine(role, "starting", "waiting for media server")
		}
	}
}
