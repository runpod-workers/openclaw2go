#!/bin/sh
# Install openclaw2go CLI
# Usage: curl -fsSL https://openclaw2go.io/install.sh | sh
set -e

REPO="runpod-workers/openclaw2go-cli"
BINARY="openclaw2go"
INSTALL_DIR="/usr/local/bin"

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Darwin)  OS="darwin" ;;
  Linux)   OS="linux" ;;
  *)       echo "Unsupported OS: $OS. Use install.ps1 for Windows."; exit 1 ;;
esac

# Detect architecture
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  ARCH="amd64" ;;
  amd64)   ARCH="amd64" ;;
  arm64)   ARCH="arm64" ;;
  aarch64) ARCH="arm64" ;;
  *)       echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

ASSET="${BINARY}-${OS}-${ARCH}"

# Get latest release tag
echo "Finding latest release..."
TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')

if [ -z "$TAG" ]; then
  echo "Could not find latest release."
  echo "Check https://github.com/${REPO}/releases"
  exit 1
fi

URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"

echo "Downloading ${BINARY} ${TAG} for ${OS}/${ARCH}..."
echo "  ${URL}"

# Download to temp file
TMP=$(mktemp)
if ! curl -fsSL "$URL" -o "$TMP"; then
  echo "Download failed. Check that a release exists for your platform."
  echo "  OS:   ${OS}"
  echo "  Arch: ${ARCH}"
  echo "  URL:  ${URL}"
  rm -f "$TMP"
  exit 1
fi

chmod +x "$TMP"

# Install — try /usr/local/bin first, fall back to ~/.local/bin
if [ -w "$INSTALL_DIR" ]; then
  mv "$TMP" "${INSTALL_DIR}/${BINARY}"
  echo "Installed to ${INSTALL_DIR}/${BINARY}"
elif [ -w "/usr/local/bin" ]; then
  mv "$TMP" "/usr/local/bin/${BINARY}"
  echo "Installed to /usr/local/bin/${BINARY}"
else
  # Fall back to ~/.local/bin
  INSTALL_DIR="${HOME}/.local/bin"
  mkdir -p "$INSTALL_DIR"
  mv "$TMP" "${INSTALL_DIR}/${BINARY}"
  echo "Installed to ${INSTALL_DIR}/${BINARY}"

  # Check if it's in PATH
  case ":$PATH:" in
    *":${INSTALL_DIR}:"*) ;;
    *)
      echo ""
      echo "Add this to your shell profile to put it in your PATH:"
      echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
      ;;
  esac
fi

echo ""
echo "Run 'openclaw2go version' to verify the installation."
