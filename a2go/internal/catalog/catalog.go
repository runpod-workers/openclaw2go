package catalog

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/runpod-labs/a2go/a2go/internal/paths"
)

const cacheTTL = 1 * time.Hour

type cacheMeta struct {
	FetchedAt int64 `json:"fetchedAt"`
}

func catalogPath() string  { return filepath.Join(paths.Cache(), "catalog.json") }
func cacheMetaPath() string { return filepath.Join(paths.Cache(), "cache-meta.json") }

func isCacheFresh() bool {
	data, err := os.ReadFile(cacheMetaPath())
	if err != nil {
		return false
	}
	var meta cacheMeta
	if err := json.Unmarshal(data, &meta); err != nil {
		return false
	}
	return time.Since(time.Unix(meta.FetchedAt, 0)) < cacheTTL
}

func readCache() ([]byte, error) {
	return os.ReadFile(catalogPath())
}

func writeCache(data []byte) error {
	if err := os.MkdirAll(paths.Cache(), 0755); err != nil {
		return err
	}
	if err := os.WriteFile(catalogPath(), data, 0644); err != nil {
		return err
	}
	meta, _ := json.Marshal(cacheMeta{FetchedAt: time.Now().Unix()})
	return os.WriteFile(cacheMetaPath(), meta, 0644)
}

// Fetch returns the catalog JSON bytes, using a local cache with 1h TTL.
// On network failure it falls back to a stale cache if available.
func Fetch(catalogURL string, timeout time.Duration) ([]byte, error) {
	// Fresh cache → return immediately
	if isCacheFresh() {
		if data, err := readCache(); err == nil {
			return data, nil
		}
	}

	// Fetch from network
	client := &http.Client{Timeout: timeout}
	resp, err := client.Get(catalogURL)
	if err == nil {
		defer resp.Body.Close()
		if resp.StatusCode == 200 {
			data, readErr := io.ReadAll(resp.Body)
			if readErr == nil {
				_ = writeCache(data)
				return data, nil
			}
			err = readErr
		} else {
			err = fmt.Errorf("HTTP %d", resp.StatusCode)
		}
	}

	// Network failed → try stale cache
	if data, cacheErr := readCache(); cacheErr == nil {
		fmt.Fprintf(os.Stderr, "Warning: using stale catalog cache (fetch failed: %v)\n", err)
		return data, nil
	}

	return nil, fmt.Errorf("failed to fetch catalog: %w", err)
}
