package cmd

import (
	"github.com/spf13/cobra"
)

var flagProxyURL string

var toolCmd = &cobra.Command{
	Use:   "tool",
	Short: "Run a2go tools (image-generate, text-to-speech, speech-to-text)",
	Long:  "Tools interact with running a2go services via the web proxy. Make sure a2go is running first (a2go run).",
}

func init() {
	toolCmd.PersistentFlags().StringVar(&flagProxyURL, "proxy", "", "web proxy URL (default http://localhost:8080, or A2GO_PROXY_URL env)")

	toolCmd.AddCommand(imageGenerateCmd)
	toolCmd.AddCommand(textToSpeechCmd)
	toolCmd.AddCommand(speechToTextCmd)
}
