package agentskills

import (
	"embed"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"
)

//go:embed bundled/*/SKILL.md
var bundled embed.FS

func skillNames() ([]string, error) {
	entries, err := fs.ReadDir(bundled, "bundled")
	if err != nil {
		return nil, err
	}

	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			names = append(names, entry.Name())
		}
	}
	return names, nil
}

func syncSkillDir(srcRoot, dstRoot string) error {
	return fs.WalkDir(bundled, srcRoot, func(srcPath string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		rel := strings.TrimPrefix(srcPath, srcRoot)
		rel = strings.TrimPrefix(rel, "/")
		dstPath := dstRoot
		if rel != "" {
			dstPath = filepath.Join(dstRoot, filepath.FromSlash(rel))
		}

		if d.IsDir() {
			return os.MkdirAll(dstPath, 0755)
		}

		data, err := bundled.ReadFile(srcPath)
		if err != nil {
			return err
		}
		return os.WriteFile(dstPath, data, 0644)
	})
}

// Sync rewrites the destination directory so it contains only the bundled a2go skills.
func Sync(dstDir string) error {
	if err := os.MkdirAll(dstDir, 0755); err != nil {
		return err
	}

	names, err := skillNames()
	if err != nil {
		return err
	}

	want := make(map[string]struct{}, len(names))
	for _, name := range names {
		want[name] = struct{}{}

		dstSkill := filepath.Join(dstDir, name)
		if err := os.RemoveAll(dstSkill); err != nil {
			return err
		}
		if err := syncSkillDir(path.Join("bundled", name), dstSkill); err != nil {
			return err
		}
	}

	entries, err := os.ReadDir(dstDir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if _, ok := want[entry.Name()]; ok {
			continue
		}
		if err := os.RemoveAll(filepath.Join(dstDir, entry.Name())); err != nil {
			return err
		}
	}

	return nil
}

func CleanupLegacyDir(dir string) error {
	return os.RemoveAll(dir)
}
