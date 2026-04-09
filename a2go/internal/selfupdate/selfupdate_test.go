package selfupdate

import "testing"

func TestIsNewer(t *testing.T) {
	tests := []struct {
		current string
		latest  string
		want    bool
	}{
		{"v0.14.0", "v0.15.0", true},
		{"v0.15.0", "v0.15.0", false},
		{"v0.15.0", "v0.14.0", false},
		{"v1.0.0", "v0.99.0", false},
		{"v0.14.0", "v0.14.1", true},
		{"v0.14.1", "v1.0.0", true},
		{"dev", "v0.1.0", true},
		{"dev", "v99.99.99", true},
	}
	for _, tt := range tests {
		t.Run(tt.current+"->"+tt.latest, func(t *testing.T) {
			got := IsNewer(tt.current, tt.latest)
			if got != tt.want {
				t.Errorf("IsNewer(%q, %q) = %v, want %v", tt.current, tt.latest, got, tt.want)
			}
		})
	}
}

func TestParseSemver(t *testing.T) {
	tests := []struct {
		input string
		want  []int
	}{
		{"v0.14.0", []int{0, 14, 0}},
		{"0.14.0", []int{0, 14, 0}},
		{"v1.2.3", []int{1, 2, 3}},
		{"v1.0.0-rc1", []int{1, 0, 0}},
		{"invalid", nil},
		{"1.2", nil},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := parseSemver(tt.input)
			if tt.want == nil {
				if got != nil {
					t.Errorf("parseSemver(%q) = %v, want nil", tt.input, got)
				}
				return
			}
			if got == nil {
				t.Fatalf("parseSemver(%q) = nil, want %v", tt.input, tt.want)
			}
			for i := range tt.want {
				if got[i] != tt.want[i] {
					t.Errorf("parseSemver(%q)[%d] = %d, want %d", tt.input, i, got[i], tt.want[i])
				}
			}
		})
	}
}

func TestAssetName(t *testing.T) {
	name := AssetName()
	if name == "" {
		t.Error("AssetName should not be empty")
	}
}
