package download

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/runpod-labs/a2go/a2go/internal/ui"
)

const githubRaw = "https://raw.githubusercontent.com/runpod/a2go/main"

func File(remotePath, localPath string, executable bool) error {
	url := githubRaw + "/" + remotePath
	ui.Info(fmt.Sprintf("downloading %s", remotePath))

	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("download failed: HTTP %d for %s", resp.StatusCode, url)
	}

	if err := os.MkdirAll(filepath.Dir(localPath), 0755); err != nil {
		return err
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	perm := os.FileMode(0644)
	if executable {
		perm = 0755
	}
	return os.WriteFile(localPath, data, perm)
}

func FileWithReplace(remotePath, localPath, old, new string) error {
	url := githubRaw + "/" + remotePath
	ui.Info(fmt.Sprintf("downloading %s", remotePath))

	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("download failed: HTTP %d for %s", resp.StatusCode, url)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	content := strings.ReplaceAll(string(data), old, new)

	if err := os.MkdirAll(filepath.Dir(localPath), 0755); err != nil {
		return err
	}
	return os.WriteFile(localPath, []byte(content), 0644)
}
