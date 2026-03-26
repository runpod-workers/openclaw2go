package catalog

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/runpod-labs/a2go/a2go/internal/paths"
)

func setupTestDir(t *testing.T) {
	t.Helper()
	orig := paths.InstallDir
	paths.InstallDir = t.TempDir()
	t.Cleanup(func() { paths.InstallDir = orig })
}

func startServer(t *testing.T, body string, status int) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
		w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestFetch_FirstRunOnline(t *testing.T) {
	setupTestDir(t)
	payload := `{"models":[{"name":"test"}]}`
	srv := startServer(t, payload, 200)

	data, err := Fetch(srv.URL, 5*time.Second)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(data) != payload {
		t.Fatalf("got %q, want %q", data, payload)
	}

	// Verify cache files were written
	if _, err := os.Stat(catalogPath()); err != nil {
		t.Fatal("catalog.json not cached")
	}
	if _, err := os.Stat(cacheMetaPath()); err != nil {
		t.Fatal("cache-meta.json not written")
	}
}

func TestFetch_FreshCache(t *testing.T) {
	setupTestDir(t)
	payload := `{"models":[{"name":"cached"}]}`
	srv := startServer(t, payload, 200)

	// Prime the cache
	if _, err := Fetch(srv.URL, 5*time.Second); err != nil {
		t.Fatalf("priming fetch failed: %v", err)
	}
	srv.Close()

	// Server is closed — fresh cache should serve without network
	data, err := Fetch("http://127.0.0.1:1", 1*time.Second)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(data) != payload {
		t.Fatalf("got %q, want %q", data, payload)
	}
}

func TestFetch_StaleCache_Refetch(t *testing.T) {
	setupTestDir(t)
	oldPayload := `{"models":[{"name":"old"}]}`
	newPayload := `{"models":[{"name":"new"}]}`

	// Write stale cache (2 hours ago)
	os.MkdirAll(paths.Cache(), 0755)
	os.WriteFile(catalogPath(), []byte(oldPayload), 0644)
	meta, _ := json.Marshal(cacheMeta{FetchedAt: time.Now().Add(-2 * time.Hour).Unix()})
	os.WriteFile(cacheMetaPath(), meta, 0644)

	srv := startServer(t, newPayload, 200)

	data, err := Fetch(srv.URL, 5*time.Second)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(data) != newPayload {
		t.Fatalf("got %q, want %q (should have re-fetched)", data, newPayload)
	}
}

func TestFetch_StaleCache_Offline(t *testing.T) {
	setupTestDir(t)
	stalePayload := `{"models":[{"name":"stale"}]}`

	// Write stale cache
	os.MkdirAll(paths.Cache(), 0755)
	os.WriteFile(catalogPath(), []byte(stalePayload), 0644)
	meta, _ := json.Marshal(cacheMeta{FetchedAt: time.Now().Add(-2 * time.Hour).Unix()})
	os.WriteFile(cacheMetaPath(), meta, 0644)

	// Unreachable URL simulates offline
	data, err := Fetch("http://127.0.0.1:1", 1*time.Second)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(data) != stalePayload {
		t.Fatalf("got %q, want %q (should fall back to stale cache)", data, stalePayload)
	}
}

func TestFetch_NoCache_Offline(t *testing.T) {
	setupTestDir(t)

	_, err := Fetch("http://127.0.0.1:1", 1*time.Second)
	if err == nil {
		t.Fatal("expected error when offline with no cache")
	}
}

func TestFetch_HTTPError_FallsBackToStaleCache(t *testing.T) {
	setupTestDir(t)
	stalePayload := `{"models":[{"name":"stale"}]}`

	// Write stale cache
	os.MkdirAll(paths.Cache(), 0755)
	os.WriteFile(catalogPath(), []byte(stalePayload), 0644)
	meta, _ := json.Marshal(cacheMeta{FetchedAt: time.Now().Add(-2 * time.Hour).Unix()})
	os.WriteFile(cacheMetaPath(), meta, 0644)

	srv := startServer(t, "error", 500)

	data, err := Fetch(srv.URL, 5*time.Second)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(data) != stalePayload {
		t.Fatalf("got %q, want %q (should fall back on HTTP 500)", data, stalePayload)
	}
}

func TestFetch_HTTPError_NoCacheFails(t *testing.T) {
	setupTestDir(t)
	srv := startServer(t, "error", 500)

	_, err := Fetch(srv.URL, 5*time.Second)
	if err == nil {
		t.Fatal("expected error on HTTP 500 with no cache")
	}
}

func TestIsCacheFresh(t *testing.T) {
	setupTestDir(t)

	// No meta file → not fresh
	if isCacheFresh() {
		t.Fatal("expected not fresh when no meta file")
	}

	// Write fresh meta
	os.MkdirAll(paths.Cache(), 0755)
	meta, _ := json.Marshal(cacheMeta{FetchedAt: time.Now().Unix()})
	os.WriteFile(cacheMetaPath(), meta, 0644)
	if !isCacheFresh() {
		t.Fatal("expected fresh with recent fetchedAt")
	}

	// Write stale meta
	meta, _ = json.Marshal(cacheMeta{FetchedAt: time.Now().Add(-2 * time.Hour).Unix()})
	os.WriteFile(cacheMetaPath(), meta, 0644)
	if isCacheFresh() {
		t.Fatal("expected not fresh with old fetchedAt")
	}

	// Write invalid JSON
	os.WriteFile(cacheMetaPath(), []byte("not json"), 0644)
	if isCacheFresh() {
		t.Fatal("expected not fresh with invalid meta")
	}
}
