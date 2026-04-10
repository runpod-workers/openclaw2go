package paths

import (
	"os"
	"path/filepath"
)

var InstallDir = filepath.Join(os.Getenv("HOME"), ".a2go")

func Bin() string            { return filepath.Join(InstallDir, "bin") }
func Venv() string           { return filepath.Join(InstallDir, "venv") }
func VenvBin() string        { return filepath.Join(Venv(), "bin") }
func VenvPython() string     { return filepath.Join(VenvBin(), "python3") }
func VenvPip() string        { return filepath.Join(VenvBin(), "pip") }
func Skills() string         { return filepath.Join(InstallDir, "skills") } // legacy local install dir; cleaned up on run/doctor
func Images() string         { return filepath.Join(InstallDir, "images") }
func Pids() string           { return filepath.Join(InstallDir, "pids") }
func Logs() string           { return filepath.Join(InstallDir, "logs") }
func Audio() string          { return filepath.Join(InstallDir, "audio") }
func Cache() string          { return filepath.Join(InstallDir, "cache") }
func LastConfig() string     { return filepath.Join(InstallDir, "last-config.json") }
func ContainerID() string    { return filepath.Join(InstallDir, "container-id") }
func OpenClawState() string  { return filepath.Join(os.Getenv("HOME"), ".openclaw") }
func HermesState() string    { return filepath.Join(os.Getenv("HOME"), ".hermes") }
func OpenClawSkills() string { return filepath.Join(OpenClawState(), "skills", "a2go") }
func HermesSkills() string   { return filepath.Join(HermesState(), "skills", "a2go") }

func EnsureAll() error {
	dirs := []string{
		Bin(), Venv(), Images(), Audio(), Pids(), Logs(), Cache(),
	}
	for _, d := range dirs {
		if err := os.MkdirAll(d, 0755); err != nil {
			return err
		}
	}
	return nil
}
