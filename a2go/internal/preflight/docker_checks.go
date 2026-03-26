package preflight

import (
	"fmt"
	"os/exec"
	"strings"

	"github.com/runpod-labs/a2go/a2go/internal/docker"
)

// RunDocker runs Docker-specific preflight checks and returns results.
func RunDocker() ([]CheckResult, bool) {
	var results []CheckResult
	allOk := true

	r := checkDocker()
	results = append(results, r)
	if !r.Ok {
		allOk = false
	}

	r = checkNvidiaGPU()
	results = append(results, r)
	if !r.Ok {
		allOk = false
	}

	r = checkDockerGPU()
	results = append(results, r)
	if !r.Ok {
		allOk = false
	}

	return results, allOk
}

func checkDocker() CheckResult {
	ok, version := docker.IsInstalled()
	if !ok {
		return CheckResult{
			"docker",
			false,
			"docker CLI not found. install: https://docs.docker.com/get-started/get-docker/",
		}
	}
	// Verify daemon is reachable
	if err := exec.Command("docker", "info").Run(); err != nil {
		return CheckResult{
			"docker",
			false,
			fmt.Sprintf("docker CLI found (%s) but daemon is not running. start Docker and retry.", version),
		}
	}
	return CheckResult{"docker", true, version}
}

func checkNvidiaGPU() CheckResult {
	out, err := exec.Command("nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits").Output()
	if err != nil {
		return CheckResult{
			"nvidia-gpu",
			false,
			"nvidia-smi not found. install NVIDIA drivers: https://www.nvidia.com/en-us/drivers/",
		}
	}
	line := strings.TrimSpace(strings.SplitN(string(out), "\n", 2)[0])
	parts := strings.SplitN(line, ", ", 2)
	gpu := parts[0]
	// memory.total returns [N/A] on unified memory systems (e.g. DGX Spark GB10)
	if len(parts) == 2 && !strings.Contains(parts[1], "N/A") {
		gpu = fmt.Sprintf("%s (%s MiB)", parts[0], parts[1])
	}
	return CheckResult{"nvidia-gpu", true, gpu}
}

func checkDockerGPU() CheckResult {
	ok, detail := docker.HasGPUSupport()
	if !ok {
		return CheckResult{
			"docker-gpu",
			false,
			"nvidia-container-toolkit not found. docker needs this to pass GPUs into containers (--gpus flag). install: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html",
		}
	}
	return CheckResult{"docker-gpu", true, detail}
}
