package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/runpod-labs/a2go/a2go/internal/docker"
	"github.com/runpod-labs/a2go/a2go/internal/platform"
	"github.com/runpod-labs/a2go/a2go/internal/process"
	"github.com/runpod-labs/a2go/a2go/internal/services"
	"github.com/runpod-labs/a2go/a2go/internal/ui"
)

var stopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop all services",
	Run:   runStop,
}

func runStop(cmd *cobra.Command, args []string) {
	doStop()
}

func doStop() {
	if platform.UseDockerBackend() {
		doStopDocker()
	} else {
		doStopMlx()
	}
}

func doStopDocker() {
	fmt.Println()
	fmt.Println("agent2go — Stopping container...")

	status := docker.ContainerStatus(containerName)
	if status == "" {
		fmt.Println()
		fmt.Println("  No a2go container found.")
		// Check if ports are held by something else
		for _, port := range []int{8000, 8080, 18789} {
			if process.PortListening(port) {
				fmt.Printf("  Note: port %d is in use by another process (not managed by a2go).\n", port)
				fmt.Printf("  Find it: docker ps --filter publish=%d or lsof -iTCP:%d -sTCP:LISTEN\n", port, port)
				break
			}
		}
		fmt.Println()
		return
	}

	if status == "running" {
		if err := docker.StopContainer(containerName); err != nil {
			ui.Fail(fmt.Sprintf("failed to stop container: %v", err))
		} else {
			ui.Ok("container stopped")
		}
	}

	if err := docker.RemoveContainer(containerName); err != nil {
		ui.Fail(fmt.Sprintf("failed to remove container: %v", err))
	} else {
		ui.Ok("container removed")
	}

	docker.RemoveContainerIDFile()

	fmt.Println()
	fmt.Println("  All services stopped.")
	fmt.Println()
}

func doStopMlx() {
	fmt.Println()
	fmt.Println("agent2go — Stopping services...")

	stopped := 0

	// Stop in reverse order: gateway, web-proxy, image, audio, llm
	order := []services.Service{services.Gateway, services.WebProxy, services.Image, services.Audio, services.LLM}
	for _, svc := range order {
		pid, err := process.ReadPid(svc.Name)
		if err == nil && process.IsAlive(pid) {
			process.Kill(pid)
			ui.Ok(fmt.Sprintf("stopped %s (pid %d)", svc.Name, pid))
			stopped++
		}
		process.RemovePidFile(svc.Name)
	}

	// Kill orphans on known ports
	for _, svc := range order {
		if pid, ok := process.KillByPort(svc.Port); ok {
			ui.Ok(fmt.Sprintf("killed orphan on :%d (pid %d)", svc.Port, pid))
			stopped++
		}
	}

	fmt.Println()
	if stopped == 0 {
		fmt.Println("  Nothing was running.")
	} else {
		fmt.Println("  All services stopped.")
	}
	fmt.Println()
}
