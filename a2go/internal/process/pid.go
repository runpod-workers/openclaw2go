package process

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/runpod-labs/a2go/a2go/internal/paths"
)

func PidFile(name string) string {
	return filepath.Join(paths.Pids(), name+".pid")
}

func SavePid(name string, pid int) error {
	return os.WriteFile(PidFile(name), []byte(strconv.Itoa(pid)), 0644)
}

func ReadPid(name string) (int, error) {
	data, err := os.ReadFile(PidFile(name))
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(strings.TrimSpace(string(data)))
}

func IsAlive(pid int) bool {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return proc.Signal(syscall.Signal(0)) == nil
}

func Kill(pid int) error {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	return proc.Signal(syscall.SIGTERM)
}

func RemovePidFile(name string) {
	os.Remove(PidFile(name))
}

func PortListening(port int) bool {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 500*time.Millisecond)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

func KillByPort(port int) (int, bool) {
	out, err := exec.Command("lsof", fmt.Sprintf("-iTCP:%d", port), "-sTCP:LISTEN", "-t").Output()
	if err != nil {
		return 0, false
	}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		pid, err := strconv.Atoi(strings.TrimSpace(line))
		if err == nil && pid > 0 {
			Kill(pid)
			return pid, true
		}
	}
	return 0, false
}
