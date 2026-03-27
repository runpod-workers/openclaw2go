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
