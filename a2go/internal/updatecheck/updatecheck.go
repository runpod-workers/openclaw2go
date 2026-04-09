package updatecheck

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/runpod-labs/a2go/a2go/internal/paths"
	"github.com/runpod-labs/a2go/a2go/internal/selfupdate"
	"github.com/runpod-labs/a2go/a2go/internal/ui"
)

const checkInterval = 24 * time.Hour

type checkState struct {
	LastCheck     int64  `json:"lastCheck"`
	LatestVersion string `json:"latestVersion"`
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

// Run performs a non-blocking update check and prints a hint if updates are available.
// It caches the result for 24 hours so it doesn't hit GitHub on every run.
// Set A2GO_NO_UPDATE_CHECK=1 or pass --no-update-check to skip.
func Run(currentVersion string) {
	if os.Getenv("A2GO_NO_UPDATE_CHECK") == "1" {
		return
	}

	state := loadState()

	// Use cached result if fresh
	if state != nil && time.Since(time.Unix(state.LastCheck, 0)) < checkInterval {
		if state.LatestVersion != "" && selfupdate.IsNewer(currentVersion, state.LatestVersion) {
			printHint(currentVersion, state.LatestVersion)
		}
		return
	}

	// Fetch in the foreground but with a short timeout — this check should be fast.
	// We do a simple goroutine with a channel to avoid blocking startup for more than 2s.
	type result struct {
		version string
		err     error
	}
	ch := make(chan result, 1)
	go func() {
		v, err := selfupdate.FetchLatestVersion()
		ch <- result{v, err}
	}()

	select {
	case r := <-ch:
		if r.err != nil {
			// Network issue — save state so we don't retry for 24h
			saveState(&checkState{LastCheck: time.Now().Unix()})
			return
		}
		saveState(&checkState{
			LastCheck:     time.Now().Unix(),
			LatestVersion: r.version,
		})
		if selfupdate.IsNewer(currentVersion, r.version) {
			printHint(currentVersion, r.version)
		}
	case <-time.After(2 * time.Second):
		// Don't block startup — skip this time
		return
	}
}

func printHint(current, latest string) {
	fmt.Println()
	ui.Info(fmt.Sprintf("Update available: %s -> %s    (a2go update)", current, latest))
}
