package cmd

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/spf13/cobra"

	"github.com/runpod-labs/a2go/a2go/internal/proxy"
)

var flagSTTOutput string

var speechToTextCmd = &cobra.Command{
	Use:   "speech-to-text <audio-file>",
	Short: "Transcribe speech audio to text",
	Long:  "Transcribe a WAV audio file to text using the a2go audio service via the web proxy.",
	Args:  cobra.ExactArgs(1),
	RunE:  runSpeechToText,
}

func init() {
	speechToTextCmd.Flags().StringVarP(&flagSTTOutput, "output", "o", "", "output text file (default: stdout)")
}

func runSpeechToText(cmd *cobra.Command, args []string) error {
	audioPath := args[0]

	audioData, err := os.ReadFile(audioPath)
	if err != nil {
		return fmt.Errorf("read audio file: %w", err)
	}

	client := proxy.NewClient(flagProxyURL, 120*time.Second)

	encoded := base64.StdEncoding.EncodeToString(audioData)
	payload := map[string]interface{}{
		"audioBase64": encoded,
		"format":      "wav",
	}

	fmt.Fprintf(os.Stderr, "Transcribing: %s\n", audioPath)

	var result struct {
		Text  string `json:"text"`
		Error string `json:"error"`
	}
	if err := client.PostJSON("/api/audio/stt", payload, &result); err != nil {
		return err
	}

	if result.Error != "" {
		return fmt.Errorf("audio server: %s", result.Error)
	}

	if flagSTTOutput != "" {
		outDir := filepath.Dir(filepath.Clean(flagSTTOutput))
		if outDir != "." {
			os.MkdirAll(outDir, 0755)
		}
		if err := os.WriteFile(flagSTTOutput, []byte(result.Text), 0644); err != nil {
			return fmt.Errorf("write file: %w", err)
		}
		fmt.Fprintf(os.Stderr, "Transcript saved to: %s\n", flagSTTOutput)
	} else {
		fmt.Println(result.Text)
	}

	return nil
}
