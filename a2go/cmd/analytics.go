package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/runpod-labs/a2go/a2go/internal/analytics"
)

var analyticsCmd = &cobra.Command{
	Use:   "analytics",
	Short: "Manage anonymous analytics",
}

var analyticsStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show analytics status",
	Run: func(cmd *cobra.Command, args []string) {
		status := analytics.StatusInfo()
		state := "enabled"
		if !status.Enabled {
			state = "disabled"
		}
		fmt.Println("agent2go — Anonymous Analytics")
		fmt.Println()
		fmt.Printf("  Status:   %s\n", state)
		fmt.Printf("  Source:   %s\n", status.Source)
		fmt.Printf("  Endpoint: %s\n", status.Endpoint)
		fmt.Println()
		fmt.Println("  Collected: selected models, config buckets, OS/arch, GPU family/count, RAM bucket")
		fmt.Println("  Not collected: tokens, prompts, auth tokens, IPs, hostnames, file paths")
		fmt.Println()
		fmt.Println("  Disable: a2go analytics disable")
		fmt.Println("  One-off: A2GO_ANALYTICS_ENABLED=0 a2go run ...")
	},
}

var analyticsEnableCmd = &cobra.Command{
	Use:   "enable",
	Short: "Enable anonymous analytics",
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := analytics.Enable(); err != nil {
			return err
		}
		fmt.Println("anonymous analytics enabled")
		return nil
	},
}

var analyticsDisableCmd = &cobra.Command{
	Use:   "disable",
	Short: "Disable anonymous analytics",
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := analytics.Disable(); err != nil {
			return err
		}
		fmt.Println("anonymous analytics disabled")
		return nil
	},
}

func init() {
	analyticsCmd.AddCommand(analyticsStatusCmd)
	analyticsCmd.AddCommand(analyticsEnableCmd)
	analyticsCmd.AddCommand(analyticsDisableCmd)
}
