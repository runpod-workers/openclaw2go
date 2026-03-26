package platform

import "runtime"

func IsMacAppleSilicon() bool {
	return runtime.GOOS == "darwin" && runtime.GOARCH == "arm64"
}

func IsLinux() bool {
	return runtime.GOOS == "linux"
}

func IsWindows() bool {
	return runtime.GOOS == "windows"
}

func UseDockerBackend() bool {
	return !IsMacAppleSilicon()
}

func Description() string {
	return runtime.GOOS + "/" + runtime.GOARCH
}
