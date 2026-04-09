package venv

import (
	"os/exec"
	"testing"
)

func TestFindPython_PrefersPython311(t *testing.T) {
	py := FindPython()
	if py == "" {
		t.Fatal("FindPython returned empty string")
	}

	// Verify the returned path is executable
	if _, err := exec.LookPath(py); err != nil {
		t.Fatalf("FindPython returned %q which is not in PATH: %v", py, err)
	}
}

func TestPreferredPython_Order(t *testing.T) {
	// Verify the preference order is correct: 3.11 > 3.12 > 3.13 > fallback
	expected := []string{"python3.11", "python3.12", "python3.13", "python3"}
	if len(preferredPython) != len(expected) {
		t.Fatalf("preferredPython has %d entries, want %d", len(preferredPython), len(expected))
	}
	for i, want := range expected {
		if preferredPython[i] != want {
			t.Errorf("preferredPython[%d] = %q, want %q", i, preferredPython[i], want)
		}
	}
}

func TestFindPython_FallsBackToPython3(t *testing.T) {
	// Save and restore the preferred list
	orig := preferredPython
	defer func() { preferredPython = orig }()

	// Set all preferred to nonexistent binaries
	preferredPython = []string{"python3.999", "python3.998"}

	py := FindPython()
	// Should fall back to "python3" (the hardcoded fallback)
	if py != "python3" {
		t.Errorf("FindPython = %q, want %q when no preferred found", py, "python3")
	}
}

func TestFindPython_ReturnsFirstAvailable(t *testing.T) {
	orig := preferredPython
	defer func() { preferredPython = orig }()

	// Put a nonexistent binary first, then python3 which should exist
	preferredPython = []string{"python3.999", "python3"}

	py := FindPython()
	// Should skip the nonexistent one and find python3
	resolved, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 not available on this system")
	}
	if py != resolved {
		t.Errorf("FindPython = %q, want %q", py, resolved)
	}
}
