package updatecheck

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/runpod-labs/a2go/a2go/internal/paths"
	"github.com/runpod-labs/a2go/a2go/internal/selfupdate"
	"github.com/runpod-labs/a2go/a2go/internal/ui"
)

const checkInterval = 24 * time.Hour

type checkState struct {
	LastCheck      int64       `json:"lastCheck"`
	CLI            *cliState   `json:"cli,omitempty"`
	Hermes         *hermState  `json:"hermes,omitempty"`
	PythonPackages []pipState  `json:"pythonPackages,omitempty"`
}

type cliState struct {
	LatestVersion string `json:"latestVersion"`
}

type hermState struct {
	CommitsBehind int `json:"commitsBehind"`
}

type pipState struct {
	Name      string `json:"name"`
	Installed string `json:"installed"`
	Latest    string `json:"latest"`
}

func statePath() string { return filepath.Join(paths.Cache(), "update-check.json") }

func loadState() *checkState {
	data, err := os.ReadFile(statePath())
	if err != nil {
		return nil
	}
	var s checkState
	if err := json.Unmarshal(data, &s); err != nil {
		return nil
	}
	return &s
}

func saveState(s *checkState) {
	data, _ := json.Marshal(s)
	os.MkdirAll(paths.Cache(), 0755)
	os.WriteFile(statePath(), data, 0644)
}

// Run performs a non-blocking update check and prints hints if updates are available.
// Checks a2go CLI, hermes agent, and Python packages (mlx-lm, mlx-audio, mflux).
// Results are cached for 24 hours. Set A2GO_NO_UPDATE_CHECK=1 to skip.
func Run(currentVersion string) {
	if os.Getenv("A2GO_NO_UPDATE_CHECK") == "1" {
		return
	}

	state := loadState()

	// Use cached result if fresh
	if state != nil && time.Since(time.Unix(state.LastCheck, 0)) < checkInterval {
		printHints(currentVersion, state)
		return
	}

	// Run all checks in parallel with a 5s timeout.
	// Each result is saved as it arrives so partial results survive a timeout.
	newState := &checkState{LastCheck: time.Now().Unix()}
	var mu sync.Mutex
	var wg sync.WaitGroup
	wg.Add(3)

	// CLI version check
	go func() {
		defer wg.Done()
		if v, err := selfupdate.FetchLatestVersion(); err == nil {
			mu.Lock()
			newState.CLI = &cliState{LatestVersion: v}
			mu.Unlock()
		}
	}()

	// Hermes check
	go func() {
		defer wg.Done()
		if behind := checkHermesBehind(); behind > 0 {
			mu.Lock()
			newState.Hermes = &hermState{CommitsBehind: behind}
			mu.Unlock()
		}
	}()

	// Python packages check
	go func() {
		defer wg.Done()
		if pkgs := checkPipOutdated(); len(pkgs) > 0 {
			mu.Lock()
			newState.PythonPackages = pkgs
			mu.Unlock()
		}
	}()

	// Wait for all checks or timeout — save whatever we got either way
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
	}

	mu.Lock()
	saveState(newState)
	printHints(currentVersion, newState)
	mu.Unlock()
}

// checkHermesBehind returns the number of commits hermes is behind origin/main.
// Returns 0 if hermes is not a git install or if the check fails.
func checkHermesBehind() int {
	hermesRepo := filepath.Join(os.Getenv("HOME"), ".hermes", "hermes-agent")
	if _, err := os.Stat(filepath.Join(hermesRepo, ".git")); err != nil {
		return 0
	}

	// Fetch latest (quiet, ignore errors)
	fetch := exec.Command("git", "-C", hermesRepo, "fetch", "origin", "main", "--quiet")
	if err := fetch.Run(); err != nil {
		return 0
	}

	out, err := exec.Command("git", "-C", hermesRepo, "rev-list", "HEAD..origin/main", "--count").Output()
	if err != nil {
		return 0
	}

	count, _ := strconv.Atoi(strings.TrimSpace(string(out)))
	return count
}

// checkPipOutdated checks if key Python packages have newer versions available.
// Uses `pip show` (local, instant) for the installed version and a quick PyPI
// JSON API call for the latest version — much faster than `pip list --outdated`
// which queries PyPI for every installed package.
var trackedPackages = []string{"mlx-lm", "mlx-audio", "mflux"}

func checkPipOutdated() []pipState {
	python := paths.VenvPython()
	if _, err := os.Stat(python); err != nil {
		return nil
	}

	var outdated []pipState
	for _, pkg := range trackedPackages {
		installed := pipShowVersion(python, pkg)
		if installed == "" {
			continue
		}
		latest := pypiLatestVersion(pkg)
		if latest == "" || latest == installed {
			continue
		}
		if selfupdate.IsNewer(installed, latest) {
			outdated = append(outdated, pipState{
				Name:      pkg,
				Installed: installed,
				Latest:    latest,
			})
		}
	}
	return outdated
}

// pipShowVersion returns the installed version of a package via `pip show` (local, instant).
func pipShowVersion(python, pkg string) string {
	out, err := exec.Command(python, "-m", "pip", "show", pkg).Output()
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(out), "\n") {
		if strings.HasPrefix(line, "Version: ") {
			return strings.TrimSpace(strings.TrimPrefix(line, "Version: "))
		}
	}
	return ""
}

// pypiLatestVersion fetches the latest version of a package from PyPI JSON API.
func pypiLatestVersion(pkg string) string {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(fmt.Sprintf("https://pypi.org/pypi/%s/json", pkg))
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return ""
	}
	var data struct {
		Info struct {
			Version string `json:"version"`
		} `json:"info"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return ""
	}
	return data.Info.Version
}

func printHints(currentVersion string, state *checkState) {
	var lines []string

	if state.CLI != nil && state.CLI.LatestVersion != "" && selfupdate.IsNewer(currentVersion, state.CLI.LatestVersion) {
		lines = append(lines, fmt.Sprintf("    a2go:    %s -> %s    (a2go update)", currentVersion, state.CLI.LatestVersion))
	}
	if state.Hermes != nil && state.Hermes.CommitsBehind > 0 {
		lines = append(lines, fmt.Sprintf("    hermes:  %d commits behind    (a2go doctor)", state.Hermes.CommitsBehind))
	}
	for _, p := range state.PythonPackages {
		lines = append(lines, fmt.Sprintf("    %s:  %s -> %s    (a2go doctor)", p.Name, p.Installed, p.Latest))
	}

	if len(lines) == 0 {
		return
	}

	fmt.Println()
	ui.Info("Updates available:")
	for _, line := range lines {
		fmt.Println(line)
	}
}
