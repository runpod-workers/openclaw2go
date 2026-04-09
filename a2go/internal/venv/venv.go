package venv

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"github.com/runpod-labs/a2go/a2go/internal/paths"
	"github.com/runpod-labs/a2go/a2go/internal/ui"
)

const MinPythonMinor = 11

func Exists() bool {
	_, err := os.Stat(paths.VenvPython())
	return err == nil
}

// PythonVersion returns the major.minor version of the system python3.
func PythonVersion() (major, minor int, err error) {
	out, e := exec.Command("python3", "-c",
		"import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')").Output()
	if e != nil {
		return 0, 0, fmt.Errorf("python3 not found — install Python 3.%d+ from https://www.python.org", MinPythonMinor)
	}
	ver := strings.TrimSpace(string(out))
	parts := strings.SplitN(ver, ".", 2)
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("could not parse python version: %s", ver)
	}
	maj, _ := strconv.Atoi(parts[0])
	min, _ := strconv.Atoi(parts[1])
	return maj, min, nil
}

// CheckPythonVersion validates that python3 exists and is >= 3.MinPythonMinor.
func CheckPythonVersion() (string, error) {
	major, minor, err := PythonVersion()
	if err != nil {
		return "", err
	}
	ver := fmt.Sprintf("%d.%d", major, minor)
	if major < 3 || (major == 3 && minor < MinPythonMinor) {
		return ver, fmt.Errorf("python 3.%d+ required (found %s)", MinPythonMinor, ver)
	}
	return ver, nil
}

func Create() error {
	if Exists() {
		ui.Ok("venv already exists")
		return nil
	}
	ui.Info("creating python venv...")
	cmd := exec.Command("python3", "-m", "venv", paths.Venv())
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func PipInstall(packages ...string) error {
	ui.Info(fmt.Sprintf("installing %v ...", packages))
	args := append([]string{"install", "--upgrade"}, packages...)
	// Upgrade pip first silently
	upgPip := exec.Command(paths.VenvPip(), "install", "--upgrade", "pip")
	upgPip.Stdout = nil
	upgPip.Stderr = nil
	_ = upgPip.Run()

	cmd := exec.Command(paths.VenvPip(), args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func PythonCanImport(module string) bool {
	cmd := exec.Command(paths.VenvPython(), "-c", fmt.Sprintf("import %s", module))
	return cmd.Run() == nil
}
