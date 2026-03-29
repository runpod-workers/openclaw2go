package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/runpod-labs/a2go/a2go/internal/proxy"
)

var (
	flagTTSText   string
	flagTTSOutput string
	flagTTSVoice  string
)

var textToSpeechCmd = &cobra.Command{
	Use:   "text-to-speech [text]",
	Short: "Convert text to speech audio",
	Long:  "Convert text to speech using the a2go audio service via the web proxy.",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runTextToSpeech,
}

func init() {
	f := textToSpeechCmd.Flags()
	f.StringVar(&flagTTSText, "text", "", "text to convert (alternative to positional arg)")
	f.StringVarP(&flagTTSOutput, "output", "o", "", "output WAV file path (required)")
	f.StringVarP(&flagTTSVoice, "voice", "v", "", "voice to use (e.g. \"US male\", \"UK female\")")
	textToSpeechCmd.MarkFlagRequired("output")
}

func runTextToSpeech(cmd *cobra.Command, args []string) error {
	text := flagTTSText
	if len(args) > 0 {
		text = args[0]
	}
	if strings.TrimSpace(text) == "" {
		return fmt.Errorf("text is required (positional arg or --text)")
	}

	client := proxy.NewClient(flagProxyURL, 300*time.Second)

	payload := map[string]interface{}{
		"text": text,
	}
	if flagTTSVoice != "" {
		payload["voice"] = flagTTSVoice
	}

	fmt.Fprintf(os.Stderr, "Generating speech for: \"%s\"\n", text)

	data, contentType, err := client.PostJSONRaw("/api/audio/tts", payload)
	if err != nil {
		return err
	}

	// If the response is JSON, it's an error
	if strings.Contains(contentType, "application/json") {
		return fmt.Errorf("audio server error: %s", string(data))
	}

	outDir := filepath.Dir(filepath.Clean(flagTTSOutput))
	if outDir != "." {
		os.MkdirAll(outDir, 0755)
	}
	if err := os.WriteFile(flagTTSOutput, data, 0644); err != nil {
		return fmt.Errorf("write file: %w", err)
	}

	fmt.Fprintf(os.Stderr, "Audio saved to: %s (%d bytes)\n", flagTTSOutput, len(data))
	fmt.Println(flagTTSOutput)
	return nil
}
