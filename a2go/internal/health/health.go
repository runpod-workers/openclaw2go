package health

import (
	"fmt"
	"net/http"
	"time"
)

// WaitForReady polls a health endpoint until it returns 200 or times out.
// isAlive is called each iteration to check if the backing process/container is still running.
func WaitForReady(url string, isAlive func() bool, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	interval := 3 * time.Second
	waited := time.Duration(0)

	for time.Now().Before(deadline) {
		if !isAlive() {
			return fmt.Errorf("container exited unexpectedly (crashed or was stopped externally)")
		}

		resp, err := http.Get(url)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				return nil
			}
		}

		time.Sleep(interval)
		waited += interval
		if waited%(15*time.Second) == 0 {
			fmt.Printf("      still waiting... (%ds/%ds)\n", int(waited.Seconds()), int(timeout.Seconds()))
		}
	}
	return fmt.Errorf("timed out after %ds", int(timeout.Seconds()))
}
