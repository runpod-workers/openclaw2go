package agentskills

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSync_WritesOnlyBundledSkills(t *testing.T) {
	dst := t.TempDir()

	if err := os.WriteFile(filepath.Join(dst, "random.txt"), []byte("junk"), 0644); err != nil {
		t.Fatalf("write stale file: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dst, "image-generate"), 0755); err != nil {
		t.Fatalf("mkdir stale dir: %v", err)
	}

	if err := Sync(dst); err != nil {
		t.Fatalf("Sync: %v", err)
	}

	entries, err := os.ReadDir(dst)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}

	expected := map[string]struct{}{
		"a2go-image-generate": {},
		"a2go-text-to-speech": {},
		"a2go-speech-to-text": {},
	}
	if len(entries) != len(expected) {
		t.Fatalf("got %d entries, want %d", len(entries), len(expected))
	}
	for _, entry := range entries {
		if _, ok := expected[entry.Name()]; !ok {
			t.Fatalf("unexpected managed skill: %s", entry.Name())
		}
		if _, err := os.Stat(filepath.Join(dst, entry.Name(), "SKILL.md")); err != nil {
			t.Fatalf("missing SKILL.md for %s: %v", entry.Name(), err)
		}
	}
}
