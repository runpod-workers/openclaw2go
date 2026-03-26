package docker

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// ContainerOpts defines options for running a Docker container.
type ContainerOpts struct {
	Image   string
	Name    string
	Env     map[string]string
	Ports   []string // "host:container"
	Volumes []string // "host:container"
	GPUs    string   // e.g. "all"
}

// IsInstalled checks if docker CLI is available and returns version info.
func IsInstalled() (bool, string) {
	out, err := exec.Command("docker", "--version").Output()
	if err != nil {
		return false, ""
	}
	return true, strings.TrimSpace(string(out))
}

// HasGPUSupport checks if Docker can access NVIDIA GPUs via --gpus flag.
// Modern setups use nvidia-container-toolkit with OCI hooks (no separate runtime needed).
// Legacy setups register an "nvidia" runtime in Docker's daemon.json.
func HasGPUSupport() (bool, string) {
	// Modern: nvidia-container-toolkit provides nvidia-ctk and OCI hooks.
	// This works with plain runc — no need for nvidia runtime in daemon.json.
	out, err := exec.Command("nvidia-ctk", "--version").CombinedOutput()
	if err == nil {
		version := strings.TrimSpace(string(out))
		return true, version
	}

	// Legacy: nvidia runtime registered in Docker daemon config.
	runtimeOut, err := exec.Command("docker", "info", "--format", "{{json .Runtimes}}").Output()
	if err == nil && strings.Contains(string(runtimeOut), "nvidia") {
		return true, "nvidia runtime (legacy daemon.json config)"
	}

	return false, ""
}

// ImageExists checks whether a Docker image is available locally.
func ImageExists(image string) bool {
	err := exec.Command("docker", "image", "inspect", image).Run()
	return err == nil
}

// PullImage pulls a Docker image, streaming progress to stdout.
// Returns a descriptive error including stderr output for diagnosis.
func PullImage(image string) error {
	cmd := exec.Command("docker", "pull", image)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("docker pull %s failed: %w", image, err)
	}
	return nil
}

// RunContainer starts a detached container and returns the container ID.
func RunContainer(opts ContainerOpts) (string, error) {
	args := []string{"run", "-d"}

	if opts.Name != "" {
		args = append(args, "--name", opts.Name)
	}
	if opts.GPUs != "" {
		args = append(args, "--gpus", opts.GPUs)
	}
	for k, v := range opts.Env {
		args = append(args, "-e", fmt.Sprintf("%s=%s", k, v))
	}
	for _, p := range opts.Ports {
		args = append(args, "-p", p)
	}
	for _, v := range opts.Volumes {
		args = append(args, "-v", v)
	}
	args = append(args, opts.Image)

	out, err := exec.Command("docker", args...).CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("docker run failed: %s\n%s", err, strings.TrimSpace(string(out)))
	}
	return strings.TrimSpace(string(out)), nil
}

// StopContainer stops a running container by name.
func StopContainer(name string) error {
	return exec.Command("docker", "stop", name).Run()
}

// RemoveContainer removes a container by name.
func RemoveContainer(name string) error {
	return exec.Command("docker", "rm", "-f", name).Run()
}

// ContainerStatus returns the status of a container (e.g. "running", "exited", "").
func ContainerStatus(name string) string {
	out, err := exec.Command("docker", "inspect", "--format", "{{.State.Status}}", name).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// ContainerLogs returns the last N lines of container logs.
func ContainerLogs(name string, tail int) string {
	out, err := exec.Command("docker", "logs", "--tail", fmt.Sprintf("%d", tail), name).CombinedOutput()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
