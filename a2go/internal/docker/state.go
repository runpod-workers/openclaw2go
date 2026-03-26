package docker

import (
	"os"
	"strings"

	"github.com/runpod-labs/a2go/a2go/internal/paths"
)

// SaveContainerID persists the container ID to disk.
func SaveContainerID(id string) error {
	return os.WriteFile(paths.ContainerID(), []byte(id), 0644)
}

// LoadContainerID reads the saved container ID.
func LoadContainerID() (string, error) {
	data, err := os.ReadFile(paths.ContainerID())
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(data)), nil
}

// RemoveContainerIDFile removes the persisted container ID file.
func RemoveContainerIDFile() error {
	return os.Remove(paths.ContainerID())
}
