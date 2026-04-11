package analytics

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/runpod-labs/a2go/a2go/internal/config"
	"github.com/runpod-labs/a2go/a2go/internal/paths"
)

const (
	DefaultEndpoint = "https://a2go.run/v1/analytics"
	dedupeWindow    = 24 * time.Hour
)

type Preferences struct {
	Enabled *bool `json:"enabled,omitempty"`
}

type state struct {
	Events map[string]int64 `json:"events,omitempty"`
}

type Event struct {
	Event   string     `json:"event"`
	SentAt  string     `json:"sentAt"`
	Version string     `json:"version"`
	Source  string     `json:"source"`
	Backend string     `json:"backend"`
	Agent   string     `json:"agent"`
	Models  Models     `json:"models"`
	Config  ConfigInfo `json:"config"`
	System  SystemInfo `json:"system"`
}

type Models struct {
	LLM   string `json:"llm,omitempty"`
	Image string `json:"image,omitempty"`
	Audio string `json:"audio,omitempty"`
}

type ConfigInfo struct {
	ContextLengthBucket   string `json:"contextLengthBucket,omitempty"`
	MaxOutputTokensBucket string `json:"maxOutputTokensBucket,omitempty"`
}

type SystemInfo struct {
	OS        string   `json:"os"`
	Arch      string   `json:"arch"`
	RAMBucket string   `json:"ramBucket,omitempty"`
	GPU       *GPUInfo `json:"gpu,omitempty"`
}

type GPUInfo struct {
	Family        string `json:"family,omitempty"`
	Count         int    `json:"count,omitempty"`
	VRAMBucket    string `json:"vramBucket,omitempty"`
	UnifiedMemory bool   `json:"unifiedMemory,omitempty"`
}

type Status struct {
	Enabled  bool
	Source   string
	Endpoint string
}

var (
	nowFunc       = time.Now
	httpClient    = &http.Client{Timeout: 2 * time.Second}
	commandOutput = exec.Command
	readFile      = os.ReadFile
	writeFile     = os.WriteFile
	mkdirAll      = os.MkdirAll
)

func StatusInfo() Status {
	enabled, source := enabled()
	return Status{
		Enabled:  enabled,
		Source:   source,
		Endpoint: endpoint(),
	}
}

func Enable() error {
	return savePreferences(true)
}

func Disable() error {
	return savePreferences(false)
}

func Run(version string, cfg *config.Config, source string, backend string) {
	enabled, _ := enabled()
	if !enabled {
		return
	}

	go func() {
		event := buildEvent(version, cfg, source, backend)
		payload, err := json.Marshal(event)
		if err != nil {
			return
		}
		signature := eventSignature(event)
		if recentlySent(signature) {
			return
		}
		if send(payload) {
			markSent(signature)
		}
	}()
}

func buildEvent(version string, cfg *config.Config, source string, backend string) Event {
	models := Models{}
	if cfg.LLM != nil {
		models.LLM = cfg.LLM.Model
	}
	if cfg.Image != nil {
		models.Image = cfg.Image.Model
	}
	if cfg.Audio != nil && cfg.Audio.Model != "" {
		models.Audio = cfg.Audio.Model
	}

	return Event{
		Event:   "runtime_started",
		SentAt:  nowFunc().UTC().Format(time.RFC3339),
		Version: version,
		Source:  source,
		Backend: backend,
		Agent:   cfg.Agent,
		Models:  models,
		Config: ConfigInfo{
			ContextLengthBucket:   bucketTokens(cfg.GetContextLength()),
			MaxOutputTokensBucket: bucketTokens(cfg.GetMaxOutputTokens()),
		},
		System: detectSystem(backend),
	}
}

func enabled() (bool, string) {
	if v, ok := parseBoolEnv("A2GO_NO_ANALYTICS"); ok {
		return !v, "env:A2GO_NO_ANALYTICS"
	}
	if v, ok := parseBoolEnv("A2GO_ANALYTICS_ENABLED"); ok {
		return v, "env:A2GO_ANALYTICS_ENABLED"
	}

	prefs := loadPreferences()
	if prefs.Enabled != nil {
		if *prefs.Enabled {
			return true, "preferences"
		}
		return false, "preferences"
	}
	return true, "default"
}

func endpoint() string {
	if v := strings.TrimSpace(os.Getenv("A2GO_ANALYTICS_URL")); v != "" {
		return v
	}
	return DefaultEndpoint
}

func savePreferences(enabled bool) error {
	if err := mkdirAll(paths.InstallDir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(Preferences{Enabled: &enabled}, "", "  ")
	if err != nil {
		return err
	}
	return writeFile(paths.AnalyticsPreferences(), data, 0644)
}

func loadPreferences() Preferences {
	data, err := readFile(paths.AnalyticsPreferences())
	if err != nil {
		return Preferences{}
	}
	var prefs Preferences
	if json.Unmarshal(data, &prefs) != nil {
		return Preferences{}
	}
	return prefs
}

func loadState() state {
	data, err := readFile(paths.AnalyticsState())
	if err != nil {
		return state{Events: map[string]int64{}}
	}
	var s state
	if json.Unmarshal(data, &s) != nil || s.Events == nil {
		return state{Events: map[string]int64{}}
	}
	return s
}

func recentlySent(signature string) bool {
	s := loadState()
	lastUnix, ok := s.Events[signature]
	if !ok {
		return false
	}
	return nowFunc().Sub(time.Unix(lastUnix, 0)) < dedupeWindow
}

func markSent(signature string) {
	s := loadState()
	if s.Events == nil {
		s.Events = map[string]int64{}
	}
	s.Events[signature] = nowFunc().Unix()

	if err := mkdirAll(paths.Cache(), 0755); err != nil {
		return
	}
	data, err := json.Marshal(s)
	if err != nil {
		return
	}
	_ = writeFile(paths.AnalyticsState(), data, 0644)
}

func send(payload []byte) bool {
	req, err := http.NewRequest(http.MethodPost, endpoint(), bytes.NewReader(payload))
	if err != nil {
		return false
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "a2go")

	resp, err := httpClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 300
}

func detectSystem(backend string) SystemInfo {
	info := SystemInfo{
		OS:   runtime.GOOS,
		Arch: runtime.GOARCH,
	}

	if ramBytes := detectRAMBytes(); ramBytes > 0 {
		info.RAMBucket = bucketMemory(ramBytes)
	}

	if backend == "mlx" && runtime.GOOS == "darwin" && runtime.GOARCH == "arm64" {
		info.GPU = &GPUInfo{
			Family:        "apple-silicon",
			Count:         1,
			UnifiedMemory: true,
		}
		return info
	}

	if gpu := detectNvidiaGPU(); gpu != nil {
		info.GPU = gpu
	}

	return info
}

func detectNvidiaGPU() *GPUInfo {
	cmd := commandOutput("nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits")
	out, err := cmd.Output()
	if err != nil {
		return nil
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) == "" {
		return nil
	}

	var (
		family string
		vramMb int
		count  int
	)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		count++
		parts := strings.SplitN(line, ",", 2)
		if family == "" {
			family = normalizeGPUFamily(parts[0])
		}
		if len(parts) == 2 {
			mem := strings.TrimSpace(parts[1])
			if !strings.Contains(strings.ToUpper(mem), "N/A") {
				if n, err := strconv.Atoi(mem); err == nil && n > vramMb {
					vramMb = n
				}
			}
		}
	}
	if count == 0 {
		return nil
	}

	info := &GPUInfo{Family: family, Count: count}
	if vramMb > 0 {
		info.VRAMBucket = bucketMemory(int64(vramMb) * 1024 * 1024)
	}
	return info
}

func detectRAMBytes() int64 {
	switch runtime.GOOS {
	case "darwin":
		if out, err := commandOutput("sysctl", "-n", "hw.memsize").Output(); err == nil {
			if n, err := strconv.ParseInt(strings.TrimSpace(string(out)), 10, 64); err == nil {
				return n
			}
		}
	case "linux":
		if data, err := readFile("/proc/meminfo"); err == nil {
			for _, line := range strings.Split(string(data), "\n") {
				if !strings.HasPrefix(line, "MemTotal:") {
					continue
				}
				fields := strings.Fields(line)
				if len(fields) < 2 {
					break
				}
				if kb, err := strconv.ParseInt(fields[1], 10, 64); err == nil {
					return kb * 1024
				}
				break
			}
		}
	case "windows":
		cmd := commandOutput("wmic", "computersystem", "get", "TotalPhysicalMemory", "/value")
		if out, err := cmd.Output(); err == nil {
			for _, line := range strings.Split(string(out), "\n") {
				line = strings.TrimSpace(line)
				if !strings.HasPrefix(line, "TotalPhysicalMemory=") {
					continue
				}
				if n, err := strconv.ParseInt(strings.TrimPrefix(line, "TotalPhysicalMemory="), 10, 64); err == nil {
					return n
				}
			}
		}
	}
	return 0
}

func normalizeGPUFamily(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	replacer := strings.NewReplacer(
		"nvidia", "",
		"geforce", "",
		"graphics", "",
		"gpu", "",
		"  ", " ",
	)
	name = replacer.Replace(name)
	fields := strings.Fields(name)
	return strings.Join(fields, "-")
}

func bucketTokens(n int) string {
	if n <= 0 {
		return ""
	}
	if n >= 1000000 {
		return fmt.Sprintf("%dm", n/1000000)
	}
	k := (n + 500) / 1000
	return fmt.Sprintf("%dk", k)
}

func bucketMemory(bytes int64) string {
	if bytes <= 0 {
		return ""
	}
	gb := float64(bytes) / (1024 * 1024 * 1024)
	buckets := []int{8, 12, 16, 24, 32, 48, 64, 80, 96, 128, 180, 192, 256, 384, 512, 1024}
	for _, bucket := range buckets {
		if gb <= float64(bucket)*1.12 {
			if bucket >= 1024 {
				return "1tb"
			}
			return fmt.Sprintf("%dgb", bucket)
		}
	}
	return "1tb+"
}

func parseBoolEnv(key string) (bool, bool) {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	switch value {
	case "":
		return false, false
	case "1", "true", "yes", "on":
		return true, true
	case "0", "false", "no", "off":
		return false, true
	default:
		return false, false
	}
}

func hash(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func eventSignature(event Event) string {
	event.SentAt = ""
	payload, err := json.Marshal(event)
	if err != nil {
		return ""
	}
	return hash(payload)
}
