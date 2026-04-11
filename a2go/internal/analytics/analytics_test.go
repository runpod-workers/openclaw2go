package analytics

import (
	"os"
	"os/exec"
	"testing"
	"time"

	"github.com/runpod-labs/a2go/a2go/internal/config"
	"github.com/runpod-labs/a2go/a2go/internal/paths"
)

func setupTestDir(t *testing.T) {
	t.Helper()
	orig := paths.InstallDir
	paths.InstallDir = t.TempDir()
	t.Cleanup(func() { paths.InstallDir = orig })
}

func resetTestHooks(t *testing.T) {
	t.Helper()
	origNow := nowFunc
	origClient := httpClient
	origCmd := commandOutput
	origRead := readFile
	origWrite := writeFile
	origMkdir := mkdirAll
	t.Cleanup(func() {
		nowFunc = origNow
		httpClient = origClient
		commandOutput = origCmd
		readFile = origRead
		writeFile = origWrite
		mkdirAll = origMkdir
	})
}

func TestDefaultEnabled(t *testing.T) {
	setupTestDir(t)
	resetTestHooks(t)
	os.Unsetenv("A2GO_NO_ANALYTICS")
	os.Unsetenv("A2GO_ANALYTICS_ENABLED")

	status := StatusInfo()
	if !status.Enabled {
		t.Fatal("analytics should be enabled by default")
	}
	if status.Source != "default" {
		t.Fatalf("StatusInfo().Source = %q, want default", status.Source)
	}
}

func TestPreferenceDisable(t *testing.T) {
	setupTestDir(t)
	resetTestHooks(t)
	os.Unsetenv("A2GO_NO_ANALYTICS")
	os.Unsetenv("A2GO_ANALYTICS_ENABLED")

	if err := Disable(); err != nil {
		t.Fatalf("Disable: %v", err)
	}

	status := StatusInfo()
	if status.Enabled {
		t.Fatal("analytics should be disabled after preference is saved")
	}
	if status.Source != "preferences" {
		t.Fatalf("StatusInfo().Source = %q, want preferences", status.Source)
	}
}

func TestEnvOverridesPreference(t *testing.T) {
	setupTestDir(t)
	resetTestHooks(t)
	if err := Disable(); err != nil {
		t.Fatalf("Disable: %v", err)
	}
	t.Setenv("A2GO_ANALYTICS_ENABLED", "1")

	status := StatusInfo()
	if !status.Enabled {
		t.Fatal("A2GO_ANALYTICS_ENABLED should override saved preference")
	}
	if status.Source != "env:A2GO_ANALYTICS_ENABLED" {
		t.Fatalf("StatusInfo().Source = %q, want env override", status.Source)
	}
}

func TestBuildEventBucketsConfig(t *testing.T) {
	setupTestDir(t)
	resetTestHooks(t)
	nowFunc = func() time.Time { return time.Unix(1700000000, 0).UTC() }

	ctx := 131072
	mot := 16384
	event := buildEvent("v0.16.0", &config.Config{
		Agent:           "openclaw",
		LLM:             &config.ServiceConfig{Model: "unsloth/GLM-4.7-Flash-GGUF:4bit"},
		Image:           &config.ServiceConfig{Model: "Disty0/FLUX.2-klein-4B-SDNQ-4bit-dynamic"},
		ContextLength:   &ctx,
		MaxOutputTokens: &mot,
	}, "cli", "docker")

	if event.Config.ContextLengthBucket != "131k" {
		t.Fatalf("ContextLengthBucket = %q, want 131k", event.Config.ContextLengthBucket)
	}
	if event.Config.MaxOutputTokensBucket != "16k" {
		t.Fatalf("MaxOutputTokensBucket = %q, want 16k", event.Config.MaxOutputTokensBucket)
	}
	if event.Models.LLM == "" || event.Models.Image == "" {
		t.Fatal("expected selected models to be present in payload")
	}
}

func TestBucketMemory(t *testing.T) {
	cases := map[string]int64{
		"16gb": 16 * 1024 * 1024 * 1024,
		"24gb": 24 * 1024 * 1024 * 1024,
		"1tb":  1024 * 1024 * 1024 * 1024,
		"1tb+": 2 * 1024 * 1024 * 1024 * 1024,
	}
	for want, bytes := range cases {
		if got := bucketMemory(bytes); got != want {
			t.Fatalf("bucketMemory(%d) = %q, want %q", bytes, got, want)
		}
	}
}

func TestRecentlySentWindow(t *testing.T) {
	setupTestDir(t)
	resetTestHooks(t)
	base := time.Unix(1700000000, 0).UTC()
	nowFunc = func() time.Time { return base }

	markSent("abc")
	if !recentlySent("abc") {
		t.Fatal("event should be considered recent right after markSent")
	}

	nowFunc = func() time.Time { return base.Add(25 * time.Hour) }
	if recentlySent("abc") {
		t.Fatal("event should expire after dedupe window")
	}
}

func TestEventSignatureIgnoresTimestamp(t *testing.T) {
	setupTestDir(t)
	resetTestHooks(t)

	eventA := Event{
		Event:   "runtime_started",
		SentAt:  "2026-01-01T00:00:00Z",
		Version: "v0.16.0",
		Source:  "cli",
		Backend: "docker",
		Agent:   "openclaw",
		Models:  Models{LLM: "unsloth/model:4bit"},
		Config:  ConfigInfo{ContextLengthBucket: "32k"},
		System:  SystemInfo{OS: "linux", Arch: "amd64"},
	}
	eventB := eventA
	eventB.SentAt = "2026-01-01T01:00:00Z"

	if eventSignature(eventA) != eventSignature(eventB) {
		t.Fatal("eventSignature should ignore SentAt")
	}
}

func TestDetectNvidiaGPUParsesCountAndBucket(t *testing.T) {
	setupTestDir(t)
	resetTestHooks(t)
	commandOutput = func(name string, args ...string) *exec.Cmd {
		script := "printf 'NVIDIA GeForce RTX 5090, 32768\\nNVIDIA GeForce RTX 5090, 32768\\n'"
		return exec.Command("sh", "-c", script)
	}

	gpu := detectNvidiaGPU()
	if gpu == nil {
		t.Fatal("expected gpu info")
	}
	if gpu.Count != 2 {
		t.Fatalf("gpu.Count = %d, want 2", gpu.Count)
	}
	if gpu.Family != "rtx-5090" {
		t.Fatalf("gpu.Family = %q, want rtx-5090", gpu.Family)
	}
	if gpu.VRAMBucket != "32gb" {
		t.Fatalf("gpu.VRAMBucket = %q, want 32gb", gpu.VRAMBucket)
	}
}

func TestEndpointFromEnv(t *testing.T) {
	setupTestDir(t)
	resetTestHooks(t)
	t.Setenv("A2GO_ANALYTICS_URL", "https://example.com/collect")
	if got := endpoint(); got != "https://example.com/collect" {
		t.Fatalf("endpoint() = %q", got)
	}
}
