package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"

	"github.com/spf13/cobra"

	"github.com/runpod-labs/a2go/a2go/internal/selfupdate"
	"github.com/runpod-labs/a2go/a2go/internal/ui"
)

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update a2go to the latest version",
	Long:  "Checks GitHub Releases for the latest version and replaces the current binary in-place.",
	RunE:  runUpdate,
}

var (
	updateForce   bool
	updateTmpPath string
)

func init() {
	updateCmd.Flags().BoolVarP(&updateForce, "force", "f", false, "Reinstall even if already on latest")
	updateCmd.Flags().StringVar(&updateTmpPath, "tmp-path", "", "Path to pre-downloaded binary (used internally for sudo re-exec)")
	updateCmd.Flags().MarkHidden("tmp-path")
}

func runUpdate(cmd *cobra.Command, args []string) error {
	ui.Banner("agent2go — Update")

	// Step 1: Current version
	ui.Step(1, "Current version")
	ui.Info(fmt.Sprintf("a2go %s", Version))

	// Step 2: Fetch latest
	ui.Step(2, "Checking latest release")
	latest, err := selfupdate.FetchLatestVersion()
	if err != nil {
		ui.Fail("could not reach GitHub")
		return fmt.Errorf("failed to fetch latest version: %w", err)
	}
	ui.Ok(latest)

	// Step 3: Compare
	ui.Step(3, "Comparing versions")
	if !updateForce && !selfupdate.IsNewer(Version, latest) {
		ui.Ok("already up-to-date")
		return nil
	}
	if updateForce && !selfupdate.IsNewer(Version, latest) {
		ui.Warn("already on latest — reinstalling (--force)")
	} else {
		ui.Info(fmt.Sprintf("%s → %s", Version, latest))
	}

	// Resolve the path to the current binary.
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("could not determine binary path: %w", err)
	}

	// Step 4: Download (skip if we already have a pre-downloaded binary from sudo re-exec)
	tmpPath := updateTmpPath
	if tmpPath == "" {
		ui.Step(4, "Downloading "+latest)
		url := selfupdate.DownloadURL(latest)
		ui.Dimmed(url)
		tmpPath, err = selfupdate.DownloadBinary(url)
		if err != nil {
			ui.Fail("download failed")
			return err
		}
		defer os.Remove(tmpPath)
	} else {
		ui.Step(4, "Using pre-downloaded binary")
		ui.Ok(tmpPath)
	}

	// Step 5: Replace binary
	ui.Step(5, "Replacing binary")
	ui.Dimmed(exe)

	// Check write permission; if not writable and on Unix, re-exec with sudo.
	if !selfupdate.IsWritable(exe) {
		if runtime.GOOS == "windows" {
			ui.Fail("no write permission to " + exe)
			return fmt.Errorf("run this command from an elevated (Administrator) prompt")
		}

		// Re-exec with sudo, passing --tmp-path so we don't re-download.
		ui.Warn("elevated permissions required — running with sudo")
		sudoCmd := exec.Command("sudo", exe, "update", "--force", "--tmp-path", tmpPath)
		sudoCmd.Stdin = os.Stdin
		sudoCmd.Stdout = os.Stdout
		sudoCmd.Stderr = os.Stderr
		return sudoCmd.Run()
	}

	if err := selfupdate.ReplaceBinary(tmpPath, exe); err != nil {
		ui.Fail("replace failed")
		return fmt.Errorf("could not replace binary: %w", err)
	}
	ui.Ok("binary replaced")

	// Done
	ui.Banner("Update Complete!")
	fmt.Println()
	fmt.Printf("  a2go is now at %s\n", latest)
	fmt.Println()
	return nil
}
