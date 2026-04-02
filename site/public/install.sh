#!/bin/bash
# Install the a2go CLI binary.
# Usage: curl -sSL https://a2go.run/install.sh | bash
#        curl -sSL https://a2go.run/install.sh | bash -s -- --version dev-feat-foo
set -euo pipefail

VERSION_TAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION_TAG="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

REPO="runpod-labs/a2go"
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

# Pick install dir: prefer ~/.local/bin (no sudo), fall back to /usr/local/bin
INSTALL_DIR="$HOME/.local/bin"
if [ -w "/usr/local/bin" ]; then
    INSTALL_DIR="/usr/local/bin"
fi
mkdir -p "$INSTALL_DIR"

echo "Installing a2go for ${OS}/${ARCH}..."

# Get release tag
if [ -n "$VERSION_TAG" ]; then
    LATEST="$(curl -sSL "https://api.github.com/repos/${REPO}/releases/tags/${VERSION_TAG}" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')"
    if [ -z "$LATEST" ]; then
        echo "ERROR: Could not find release for tag: $VERSION_TAG"
        echo "Check available releases at https://github.com/${REPO}/releases"
        exit 1
    fi
else
    LATEST="$(curl -sSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')"
    if [ -z "$LATEST" ]; then
        echo "ERROR: Could not determine latest release."
        exit 1
    fi
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
mv "$TMP" "$INSTALL_DIR/$BINARY_NAME"

echo ""
echo "Installed: $INSTALL_DIR/$BINARY_NAME"

# Check if install dir is in PATH
case ":$PATH:" in
    *":$INSTALL_DIR:"*) ;;
    *)
        echo ""
        echo "  WARNING: $INSTALL_DIR is not in your PATH."
        echo "  Add it by running:"
        echo ""
        SHELL_NAME="$(basename "${SHELL:-/bin/bash}")"
        case "$SHELL_NAME" in
            zsh)  echo "    echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.zshrc && source ~/.zshrc" ;;
            fish) echo "    fish_add_path $INSTALL_DIR" ;;
            *)    echo "    echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.bashrc && source ~/.bashrc" ;;
        esac
        ;;
esac

echo ""
echo "Next: a2go doctor"
echo ""
