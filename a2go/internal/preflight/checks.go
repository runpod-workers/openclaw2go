package preflight

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"

	"github.com/runpod-labs/a2go/a2go/internal/ui"
	"github.com/runpod-labs/a2go/a2go/internal/venv"
)

type CheckResult struct {
	Name    string
	Ok      bool
	Detail  string
}

func RunAll() ([]CheckResult, bool) {
	var results []CheckResult
	allOk := true

	// Python 3.10+
	r := checkPython()
	results = append(results, r)
	if !r.Ok {
		allOk = false
	}

	// pip
	r = checkPip()
	results = append(results, r)
	if !r.Ok {
		allOk = false
	}

	// Node 18+
	r = checkNode()
	results = append(results, r)
	if !r.Ok {
		allOk = false
	}

	// npm
	r = checkNpm()
	results = append(results, r)
	if !r.Ok {
		allOk = false
	}

	return results, allOk
}

func PrintResults(results []CheckResult) {
	for _, r := range results {
		if r.Ok {
			ui.Ok(r.Detail)
		} else {
			ui.Fail(r.Detail)
		}
	}
}

func checkPython() CheckResult {
	ver, err := venv.CheckPythonVersion()
	if err != nil {
		return CheckResult{"python3", false, err.Error()}
	}
	return CheckResult{"python3", true, fmt.Sprintf("python3 %s", ver)}
}

func checkPip() CheckResult {
	err := exec.Command("python3", "-m", "pip", "--version").Run()
	if err != nil {
		return CheckResult{"pip", false, "pip not found — run: python3 -m ensurepip --upgrade"}
	}
	return CheckResult{"pip", true, "pip"}
}

func checkNode() CheckResult {
	out, err := exec.Command("node", "--version").Output()
	if err != nil {
		return CheckResult{"node", false, "node not found — install Node.js 18+ from https://nodejs.org"}
	}
	ver := strings.TrimSpace(strings.TrimPrefix(string(out), "v"))
	major, _ := strconv.Atoi(strings.SplitN(ver, ".", 2)[0])
	if major < 18 {
		return CheckResult{"node", false, fmt.Sprintf("node 18+ required (found v%s)", ver)}
	}
	return CheckResult{"node", true, fmt.Sprintf("node v%s", ver)}
}

func checkNpm() CheckResult {
	err := exec.Command("npm", "--version").Run()
	if err != nil {
		return CheckResult{"npm", false, "npm not found — install Node.js 18+ from https://nodejs.org"}
	}
	return CheckResult{"npm", true, "npm"}
}
