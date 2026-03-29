package proxy

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/runpod-labs/a2go/a2go/internal/services"
)

var defaultBaseURL = fmt.Sprintf("http://localhost:%d", services.WebProxy.Port)

// Client communicates with the a2go web proxy.
type Client struct {
	BaseURL    string
	HTTPClient *http.Client
}

// NewClient creates a proxy client. The proxy URL is resolved from:
// 1. flagValue (--proxy flag, if non-empty)
// 2. A2GO_PROXY_URL environment variable
// 3. Default http://localhost:8080
func NewClient(flagValue string, timeout time.Duration) *Client {
	base := defaultBaseURL
	if env := os.Getenv("A2GO_PROXY_URL"); env != "" {
		base = env
	}
	if flagValue != "" {
		base = flagValue
	}
	return &Client{
		BaseURL: base,
		HTTPClient: &http.Client{
			Timeout: timeout,
		},
	}
}

// PostJSON sends a JSON POST request and decodes the JSON response into result.
func (c *Client) PostJSON(path string, body interface{}, result interface{}) error {
	respBytes, contentType, err := c.postRaw(path, body)
	if err != nil {
		return err
	}
	_ = contentType
	return json.Unmarshal(respBytes, result)
}

// PostJSONRaw sends a JSON POST request and returns the raw response bytes and content-type.
func (c *Client) PostJSONRaw(path string, body interface{}) ([]byte, string, error) {
	return c.postRaw(path, body)
}

func (c *Client) postRaw(path string, body interface{}) ([]byte, string, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, "", fmt.Errorf("marshal request: %w", err)
	}

	url := c.BaseURL + path
	resp, err := c.HTTPClient.Post(url, "application/json", bytes.NewReader(payload))
	if err != nil {
		return nil, "", fmt.Errorf("cannot connect to web proxy at %s — make sure a2go is running (a2go run) or set A2GO_PROXY_URL\n%w", c.BaseURL, err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, "", fmt.Errorf("proxy returned %d: %s", resp.StatusCode, string(data))
	}

	return data, resp.Header.Get("Content-Type"), nil
}
