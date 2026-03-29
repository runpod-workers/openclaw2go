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

var (
	flagImagePrompt   string
	flagImageWidth    int
	flagImageHeight   int
	flagImageAspect   string
	flagImageLongSide int
	flagImageSteps    int
	flagImageGuidance float64
	flagImageSeed     int
	flagImageOutput   string
)

var imageGenerateCmd = &cobra.Command{
	Use:   "image-generate",
	Short: "Generate an image from a text prompt",
	Long:  "Generate an image using the a2go image service via the web proxy.",
	RunE:  runImageGenerate,
}

func init() {
	f := imageGenerateCmd.Flags()
	f.StringVar(&flagImagePrompt, "prompt", "", "image prompt (required)")
	f.IntVar(&flagImageWidth, "width", 0, "output width in pixels")
	f.IntVar(&flagImageHeight, "height", 0, "output height in pixels")
	f.StringVar(&flagImageAspect, "aspect", "", "aspect ratio (e.g. 1:1, 16:9)")
	f.IntVar(&flagImageLongSide, "long-side", 1024, "long side length when using aspect ratio")
	f.IntVar(&flagImageSteps, "steps", 4, "inference steps")
	f.Float64Var(&flagImageGuidance, "guidance", 1.0, "guidance scale")
	f.IntVar(&flagImageSeed, "seed", 0, "random seed")
	f.StringVar(&flagImageOutput, "output", "output.png", "output file path")
	imageGenerateCmd.MarkFlagRequired("prompt")
}

func runImageGenerate(cmd *cobra.Command, args []string) error {
	client := proxy.NewClient(flagProxyURL, 180*time.Second)

	payload := map[string]interface{}{
		"prompt":    flagImagePrompt,
		"steps":     flagImageSteps,
		"guidance":  flagImageGuidance,
		"seed":      flagImageSeed,
		"long_side": flagImageLongSide,
	}
	if flagImageWidth > 0 {
		payload["width"] = flagImageWidth
	}
	if flagImageHeight > 0 {
		payload["height"] = flagImageHeight
	}
	if flagImageAspect != "" {
		payload["aspect"] = flagImageAspect
	}
	if flagImageOutput != "" {
		payload["filename"] = filepath.Base(flagImageOutput)
	}

	fmt.Fprintf(os.Stderr, "Generating: %s\n", flagImagePrompt)

	var result struct {
		Image         string `json:"image"`
		Width         int    `json:"width"`
		Height        int    `json:"height"`
		ImageURL      string `json:"image_url"`
		ImageLocalURL string `json:"image_local_url"`
		ImageProxyURL string `json:"image_proxy_url"`
		ImagePublicURL string `json:"image_public_url"`
		Error         string `json:"error"`
	}

	if err := client.PostJSON("/api/image/generate", payload, &result); err != nil {
		return err
	}

	if result.Error != "" {
		return fmt.Errorf("image server: %s", result.Error)
	}

	imgBytes, err := base64.StdEncoding.DecodeString(result.Image)
	if err != nil {
		return fmt.Errorf("decode image: %w", err)
	}

	outDir := filepath.Dir(filepath.Clean(flagImageOutput))
	if outDir != "." {
		os.MkdirAll(outDir, 0755)
	}
	if err := os.WriteFile(flagImageOutput, imgBytes, 0644); err != nil {
		return fmt.Errorf("write file: %w", err)
	}

	fmt.Fprintf(os.Stderr, "Saved %dx%d image to: %s\n", result.Width, result.Height, flagImageOutput)

	url := result.ImagePublicURL
	if url == "" {
		url = result.ImageProxyURL
	}
	if url == "" {
		url = result.ImageLocalURL
	}
	if url == "" {
		url = result.ImageURL
	}
	if url != "" {
		fmt.Fprintf(os.Stderr, "URL: %s\n", url)
		fmt.Fprintf(os.Stderr, "![image](%s)\n", url)
	}

	fmt.Println(flagImageOutput)
	return nil
}
