package venv

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/runpod-labs/a2go/a2go/internal/paths"
	"github.com/runpod-labs/a2go/a2go/internal/ui"
)

func Exists() bool {
	_, err := os.Stat(paths.VenvPython())
	return err == nil
}

// preferredPython returns a list of Python executables to try, in order.
// Python 3.11 is preferred because 3.14 has multiprocessing/semaphore bugs
// that crash the MLX LLM server during model download.
var preferredPython = []string{
	"python3.11",
	"python3.12",
	"python3.13",
	"python3",
}

// FindPython returns the first available Python executable from the preferred list.
func FindPython() string {
	for _, py := range preferredPython {
		if p, err := exec.LookPath(py); err == nil {
			return p
		}
	}
	return "python3"
}

func Create() error {
	if Exists() {
		ui.Ok("venv already exists")
		return nil
	}
	python := FindPython()
	ui.Info(fmt.Sprintf("creating python venv (%s)...", python))
	cmd := exec.Command(python, "-m", "venv", paths.Venv())
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
