package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var Version = "dev"

var rootCmd = &cobra.Command{
	Use:   "a2go",
	Short: "agent2go — run local AI on any platform",
	Long:  "agent2go CLI: install, run, stop, and manage local LLM + image + audio services. Works natively on macOS Apple Silicon and via Docker on Linux/Windows.",
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.AddGroup(
		&cobra.Group{ID: "management", Title: "Management:"},
		&cobra.Group{ID: "tools", Title: "Tools:"},
		&cobra.Group{ID: "info", Title: "Info:"},
	)

	doctorCmd.GroupID = "management"
	runCmd.GroupID = "management"
	stopCmd.GroupID = "management"
	restartCmd.GroupID = "management"
	statusCmd.GroupID = "management"
	analyticsCmd.GroupID = "management"

	toolCmd.GroupID = "tools"

	modelsCmd.GroupID = "info"
	versionCmd.GroupID = "info"
	updateCmd.GroupID = "info"

	rootCmd.AddCommand(doctorCmd)
	rootCmd.AddCommand(runCmd)
	rootCmd.AddCommand(stopCmd)
	rootCmd.AddCommand(restartCmd)
	rootCmd.AddCommand(statusCmd)
	rootCmd.AddCommand(analyticsCmd)
	rootCmd.AddCommand(toolCmd)
	rootCmd.AddCommand(modelsCmd)
	rootCmd.AddCommand(versionCmd)
	rootCmd.AddCommand(updateCmd)
}
