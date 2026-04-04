package selfupdate

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

// repoLatest is the GitHub releases/latest URL. GitHub 302-redirects this to
// /releases/tag/{tag}, so we can extract the tag from the final URL without
// hitting the API (which has a 60-request/hour unauthenticated rate limit).
const repoLatest = "https://github.com/runpod-labs/a2go/releases/latest"

// FetchLatestVersion returns the latest release tag (e.g. "v0.3.0") from GitHub.
// It uses the /releases/latest redirect to avoid API rate limits.
func FetchLatestVersion() (string, error) {
	req, err := http.NewRequest("HEAD", repoLatest, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "a2go")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to reach GitHub: %w", err)
	}
	defer resp.Body.Close()

	// After following redirects, the final URL contains the tag.
	// e.g. https://github.com/runpod-labs/a2go/releases/tag/v0.10.0
	finalURL := resp.Request.URL.String()
	idx := strings.LastIndex(finalURL, "/")
	if idx < 0 || idx == len(finalURL)-1 {
		return "", fmt.Errorf("could not parse tag from redirect URL: %s", finalURL)
	}
	tag := finalURL[idx+1:]
	if tag == "" {
		return "", fmt.Errorf("empty tag in redirect URL: %s", finalURL)
	}
	return tag, nil
}

// IsNewer returns true if latest is a newer semver than current.
// "dev" as current is always treated as outdated.
func IsNewer(current, latest string) bool {
	if current == "dev" {
		return true
	}
	cur := parseSemver(current)
	lat := parseSemver(latest)
	if cur == nil || lat == nil {
		// Can't parse — assume newer to be safe.
		return true
	}
	for i := 0; i < 3; i++ {
		if lat[i] > cur[i] {
			return true
		}
		if lat[i] < cur[i] {
			return false
		}
	}
	return false
}

// parseSemver strips a leading "v" and returns [major, minor, patch] or nil.
func parseSemver(s string) []int {
	s = strings.TrimPrefix(s, "v")
	parts := strings.SplitN(s, ".", 3)
	if len(parts) != 3 {
		return nil
	}
	nums := make([]int, 3)
	for i, p := range parts {
		// Strip anything after a hyphen (e.g. "0-rc1").
		if idx := strings.IndexByte(p, '-'); idx >= 0 {
			p = p[:idx]
		}
		n, err := strconv.Atoi(p)
		if err != nil {
			return nil
		}
		nums[i] = n
	}
	return nums
}

// AssetName returns the expected binary name for the current OS/arch.
func AssetName() string {
	name := fmt.Sprintf("a2go_%s_%s", runtime.GOOS, runtime.GOARCH)
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	return name
}

// DownloadURL constructs the full GitHub Release asset URL.
func DownloadURL(version string) string {
	return fmt.Sprintf(
		"https://github.com/runpod-labs/a2go/releases/download/%s/%s",
		version, AssetName(),
	)
}

// DownloadBinary downloads the binary from url to a temp file and returns its path.
func DownloadBinary(url string) (string, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "a2go")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download returned HTTP %d", resp.StatusCode)
	}

	ct := resp.Header.Get("Content-Type")
	if strings.Contains(ct, "text/html") {
		return "", fmt.Errorf("download returned HTML instead of a binary — asset may not exist")
	}

	tmp, err := os.CreateTemp("", "a2go-update-*")
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}
	defer tmp.Close()

	if _, err := io.Copy(tmp, resp.Body); err != nil {
		os.Remove(tmp.Name())
		return "", fmt.Errorf("download write failed: %w", err)
	}

	if err := os.Chmod(tmp.Name(), 0755); err != nil {
		os.Remove(tmp.Name())
		return "", fmt.Errorf("chmod failed: %w", err)
	}

	return tmp.Name(), nil
}

// ReplaceBinary atomically replaces targetPath with the binary at newPath.
// It resolves symlinks and handles cross-device moves.
func ReplaceBinary(newPath, targetPath string) error {
	// Resolve symlinks so we replace the actual file.
	resolved, err := filepath.EvalSymlinks(targetPath)
	if err != nil {
		// If the target doesn't exist yet, use as-is.
		resolved = targetPath
	}

	// Try direct rename first (same filesystem).
	if err := os.Rename(newPath, resolved); err == nil {
		return nil
	}

	// Cross-device fallback: copy to target dir, then rename.
	dir := filepath.Dir(resolved)
	staged, err := os.CreateTemp(dir, ".a2go-update-*")
	if err != nil {
		return fmt.Errorf("failed to create staging file in %s: %w", dir, err)
	}
	stagedPath := staged.Name()

	src, err := os.Open(newPath)
	if err != nil {
		os.Remove(stagedPath)
		return err
	}
	defer src.Close()

	if _, err := io.Copy(staged, src); err != nil {
		staged.Close()
		os.Remove(stagedPath)
		return fmt.Errorf("copy to staging failed: %w", err)
	}
	staged.Close()

	if err := os.Chmod(stagedPath, 0755); err != nil {
		os.Remove(stagedPath)
		return err
	}

	if err := os.Rename(stagedPath, resolved); err != nil {
		os.Remove(stagedPath)
		return fmt.Errorf("rename staged file failed: %w", err)
	}

	os.Remove(newPath)
	return nil
}

// IsWritable returns true if the directory of the given path is writable.
func IsWritable(path string) bool {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".a2go-write-test-*")
	if err != nil {
		return false
	}
	name := tmp.Name()
	tmp.Close()
	os.Remove(name)
	return true
}
