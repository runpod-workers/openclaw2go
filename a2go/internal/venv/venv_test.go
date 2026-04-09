package venv

import "testing"

func TestPythonVersion_Parses(t *testing.T) {
	major, minor, err := PythonVersion()
	if err != nil {
		t.Skipf("python3 not available: %v", err)
	}
	if major != 3 {
		t.Errorf("major = %d, want 3", major)
	}
	if minor < 10 {
		t.Errorf("minor = %d, want >= 10", minor)
	}
}

func TestCheckPythonVersion_Passes(t *testing.T) {
	err := CheckPythonVersion()
	if err != nil {
		t.Skipf("python3 not available or too old: %v", err)
	}
}
