#!/bin/bash
# Install the a2go CLI binary.
# Usage: curl -sSL https://a2go.run/install.sh | bash
set -euo pipefail

REPO="runpod-labs/a2go"
INSTALL_DIR="/usr/local/bin"
BINARY_NAME="a2go"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
    arm64|aarch64) ARCH="arm64" ;;
    x86_64)        ARCH="amd64" ;;
    *)
        echo "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

if [ "$OS" != "darwin" ] && [ "$OS" != "linux" ]; then
    echo "Unsupported OS: $OS. Use install.ps1 for Windows."
    exit 1
fi

echo "Installing a2go for ${OS}/${ARCH}..."

# Get latest release tag
LATEST="$(curl -sSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')"
if [ -z "$LATEST" ]; then
    echo "ERROR: Could not determine latest release."
    exit 1
fi
echo "  Version: $LATEST"

# Download binary
ASSET="a2go_${OS}_${ARCH}"
URL="https://github.com/${REPO}/releases/download/${LATEST}/${ASSET}"

TMP="$(mktemp)"
if ! curl -sSL -o "$TMP" "$URL"; then
    echo "ERROR: Download failed from $URL"
    rm -f "$TMP"
    exit 1
fi

# Check if we got an actual binary (not a 404 HTML page)
if file "$TMP" | grep -q "text"; then
    echo "ERROR: Download failed — asset not found: $ASSET"
    echo "Check available releases at https://github.com/${REPO}/releases"
    rm -f "$TMP"
    exit 1
fi

chmod +x "$TMP"

# Install — try without sudo first
if [ -w "$INSTALL_DIR" ]; then
    mv "$TMP" "$INSTALL_DIR/$BINARY_NAME"
else
    echo "  Need sudo to install to $INSTALL_DIR"
    sudo mv "$TMP" "$INSTALL_DIR/$BINARY_NAME"
fi

echo ""
echo "Installed: $(which $BINARY_NAME || echo "$INSTALL_DIR/$BINARY_NAME")"
echo ""
echo "Next: a2go doctor"
echo ""
