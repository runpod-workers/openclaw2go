#!/bin/bash
# Common helpers for OpenClaw Runpod entrypoints.

oc_init_web_ui() {
    local pod_id="${RUNPOD_POD_ID:-}"
    if [ -n "$pod_id" ]; then
        WEB_UI_BASE="https://${pod_id}-18789.proxy.runpod.net"
    else
        WEB_UI_BASE="https://<pod-id>-18789.proxy.runpod.net"
    fi

    WEB_UI_TOKEN="${A2GO_AUTH_TOKEN:-${OPENCLAW_WEB_PASSWORD:-changeme}}"
    WEB_UI_URL="${WEB_UI_BASE}/?token=${WEB_UI_TOKEN}"
}

oc_print_ready() {
    local api_label="$1"
    local model_label="$2"
    local context_label="$3"
    local auth_mode="$4"
    shift 4 || true

    oc_init_web_ui

    echo "================================================"
    echo "  Ready!"
    echo "  ${api_label}: http://localhost:8000"
    echo "  OpenClaw Gateway: ws://localhost:18789"

    if [ "$auth_mode" = "token" ]; then
        echo "  Web UI: ${WEB_UI_URL}"
        echo "  Web UI Token: ${WEB_UI_TOKEN}"
    else
        echo "  Web UI: ${WEB_UI_BASE}"
        echo "  Web UI Password: ${WEB_UI_TOKEN}"
    fi

    if [ -n "$model_label" ]; then
        echo "  Model: ${model_label}"
    fi
    if [ -n "$context_label" ]; then
        echo "  Context: ${context_label}"
    fi

    for extra in "$@"; do
        if [ -n "$extra" ]; then
            echo "  ${extra}"
        fi
    done

    echo "  Status: ready for requests"
    echo "================================================"
}

oc_sync_gateway_auth() {
    local mode="${1:-token}"
    local cfg="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/openclaw.json"
    if [ ! -f "$cfg" ]; then
        return
    fi
    if ! command -v python3 >/dev/null 2>&1; then
        echo "WARNING: python3 not found; skipping gateway auth sync"
        return
    fi

    A2GO_GATEWAY_AUTH_MODE="$mode" python3 - <<'PY'
import json
import os

cfg = os.path.join(os.environ.get("OPENCLAW_STATE_DIR", os.path.expanduser("~/.openclaw")), "openclaw.json")
mode = os.environ.get("A2GO_GATEWAY_AUTH_MODE", "token")
token = os.environ.get("A2GO_AUTH_TOKEN", os.environ.get("OPENCLAW_WEB_PASSWORD", "changeme"))

with open(cfg, "r", encoding="utf-8") as f:
    data = json.load(f)

gw = data.setdefault("gateway", {})
auth = gw.setdefault("auth", {})
changed = False

if mode == "token":
    if auth.get("mode") != "token":
        auth["mode"] = "token"
        changed = True
    if auth.get("token") != token:
        auth["token"] = token
        changed = True
    remote = gw.setdefault("remote", {})
    if remote.get("token") != token:
        remote["token"] = token
        changed = True
elif mode == "password":
    if auth.get("mode") != "password":
        auth["mode"] = "password"
        changed = True
    if auth.get("password") != token:
        auth["password"] = token
        changed = True

if changed:
    with open(cfg, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
PY
    chmod 600 "$cfg" 2>/dev/null || true
}

oc_sync_skills_disable() {
    local skills="${1:-}"
    local cfg="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/openclaw.json"
    if [ -z "$skills" ] || [ ! -f "$cfg" ]; then
        return
    fi
    if ! command -v python3 >/dev/null 2>&1; then
        echo "WARNING: python3 not found; skipping skill disable sync"
        return
    fi

    A2GO_DISABLED_SKILLS="$skills" python3 - <<'PY'
import json
import os

cfg = os.path.join(os.environ.get("OPENCLAW_STATE_DIR", os.path.expanduser("~/.openclaw")), "openclaw.json")
raw = os.environ.get("A2GO_DISABLED_SKILLS", "")
skills = [s.strip() for s in raw.split(",") if s.strip()]

if not skills:
    raise SystemExit(0)

with open(cfg, "r", encoding="utf-8") as f:
    data = json.load(f)

skills_cfg = data.setdefault("skills", {})
entries = skills_cfg.setdefault("entries", {})
changed = False

for skill in skills:
    entry = entries.setdefault(skill, {})
    if entry.get("enabled") is not False:
        entry["enabled"] = False
        changed = True

if changed:
    with open(cfg, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
PY
    chmod 600 "$cfg" 2>/dev/null || true
}

oc_setup_ssh_manual() {
    echo "Initializing SSH..."

    if [ -n "${PUBLIC_KEY:-}" ]; then
        mkdir -p ~/.ssh
        if command -v python3 >/dev/null 2>&1; then
            python3 - <<'PY'
import os
import re

raw = os.environ.get("PUBLIC_KEY", "")
raw = raw.strip()
if raw:
    raw = raw.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\r", "\n")
    raw = raw.replace("\r\n", "\n").replace("\r", "\n")
    key_start = r"(?:ssh-|ecdsa-|sk-)"
    raw = re.sub(rf"\s+(?={key_start}[^\s]+\s+[A-Za-z0-9+/=]{{20,}})", "\n", raw)

lines = [line.strip() for line in raw.splitlines() if line.strip()]

path = os.path.expanduser("~/.ssh/authorized_keys")
with open(path, "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + ("\n" if lines else ""))

print(f"SSH keys written: {len(lines)}")
PY
        else
            printf '%b' "$PUBLIC_KEY" | awk '
                BEGIN {
                    key_re = "^(ssh-|ecdsa-|sk-)";
                    base_re = "^[A-Za-z0-9+/=]{20,}$";
                }
                {
                    for (i = 1; i <= NF; i++) {
                        token = $i;
                        next_token = (i < NF ? $(i + 1) : "");
                        if (token ~ key_re && next_token ~ base_re) {
                            if (line != "") {
                                print line;
                            }
                            line = token;
                        } else if (line != "") {
                            line = line " " token;
                        } else {
                            line = token;
                        }
                    }
                }
                END {
                    if (line != "") {
                        print line;
                    }
                }
            ' > ~/.ssh/authorized_keys
        fi
        chmod 700 ~/.ssh
        chmod 600 ~/.ssh/authorized_keys
    else
        echo "WARNING: PUBLIC_KEY not set - SSH login disabled"
    fi

    for keytype in rsa ecdsa ed25519; do
        local keyfile="/etc/ssh/ssh_host_${keytype}_key"
        if [ ! -f "$keyfile" ]; then
            ssh-keygen -t "$keytype" -f "$keyfile" -N "" -q >/dev/null 2>&1 || true
        fi
    done

    mkdir -p /var/run/sshd
    if [ -x /usr/sbin/sshd ]; then
        /usr/sbin/sshd
        echo "SSH ready"
    else
        echo "WARNING: sshd not found - SSH unavailable"
    fi
}

oc_create_path_symlinks() {
    # On RunPod, /workspace is a persistent network volume. We symlink
    # ~/.openclaw -> /workspace/.openclaw so data survives pod restarts
    # while the canonical path stays at ~/.openclaw (matching official
    # OpenClaw defaults). When running locally (no /workspace), ~/.openclaw
    # is just a regular directory — no symlink needed.
    local home_oc="$HOME/.openclaw"

    if [ -d "/workspace" ] && [ ! -e "$home_oc" ]; then
        mkdir -p /workspace/.openclaw
        ln -sf /workspace/.openclaw "$home_oc"
        echo "Symlinked $home_oc -> /workspace/.openclaw (persistent storage)"
    fi
}

oc_start_runpod_ssh() {
    if [ -f /start.sh ]; then
        echo "Starting SSH setup..."
        /start.sh >/var/log/runpod-start.log 2>&1 &
        sleep 5
    fi
}
