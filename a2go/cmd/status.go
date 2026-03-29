package cmd

import (
	"fmt"

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
