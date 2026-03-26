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
	Long:  "agent2go CLI: install, start, stop, and manage local LLM + image + audio services. Works natively on macOS Apple Silicon and via Docker on Linux/Windows.",
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.AddCommand(doctorCmd)
	rootCmd.AddCommand(startCmd)
	rootCmd.AddCommand(stopCmd)
	rootCmd.AddCommand(restartCmd)
	rootCmd.AddCommand(statusCmd)
	rootCmd.AddCommand(versionCmd)
	rootCmd.AddCommand(modelsCmd)
	rootCmd.AddCommand(updateCmd)
}
