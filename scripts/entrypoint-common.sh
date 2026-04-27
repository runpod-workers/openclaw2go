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

oc_sync_openclaw_runtime() {
    local cfg="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/openclaw.json"
    if ! command -v python3 >/dev/null 2>&1; then
        echo "WARNING: python3 not found; skipping OpenClaw runtime config sync"
        return
    fi

    python3 - <<'PY'
import json
import os

cfg = os.path.join(os.environ.get("OPENCLAW_STATE_DIR", os.path.expanduser("~/.openclaw")), "openclaw.json")
provider_name = os.environ.get("A2GO_OC_PROVIDER_NAME", "local-llamacpp")
base_url = os.environ.get("A2GO_OC_BASE_URL", "http://localhost:8000/v1")
api_key = os.environ.get("A2GO_OC_API_KEY", os.environ.get("A2GO_API_KEY", "changeme"))
model_id = os.environ.get("A2GO_OC_MODEL_ID", "local-model")
model_name = os.environ.get("A2GO_OC_MODEL_NAME", model_id)
context_window = int(os.environ.get("A2GO_OC_CONTEXT_WINDOW", "131072"))
max_tokens = int(os.environ.get("A2GO_OC_MAX_TOKENS", "8192"))
workspace = os.environ.get("OPENCLAW_WORKSPACE", "/workspace/openclaw")
allowed_origins = json.loads(os.environ.get("A2GO_OC_ALLOWED_ORIGINS_JSON", "[]"))
has_vision = os.environ.get("A2GO_OC_HAS_VISION", "false").lower() == "true"
disable_device_auth = os.environ.get("A2GO_OC_DISABLE_DEVICE_AUTH", "false").lower() == "true"

data = {}
if os.path.exists(cfg):
    with open(cfg, "r", encoding="utf-8") as f:
        data = json.load(f)

models_cfg = data.setdefault("models", {})
providers = models_cfg.setdefault("providers", {})
providers[provider_name] = {
    "baseUrl": base_url,
    "apiKey": api_key,
    "api": "openai-completions",
    "models": [{
        "id": model_id,
        "name": model_name,
        "contextWindow": context_window,
        "maxTokens": max_tokens,
        "reasoning": False,
        "input": ["text", "image"] if has_vision else ["text"],
        "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
    }],
}

agents_cfg = data.setdefault("agents", {})
defaults = agents_cfg.setdefault("defaults", {})
model_cfg = defaults.get("model")
if not isinstance(model_cfg, dict):
    model_cfg = {}
    defaults["model"] = model_cfg
model_cfg["primary"] = f"{provider_name}/{model_id}"
defaults["contextTokens"] = min(context_window, 135000)
defaults["workspace"] = workspace

gateway = data.setdefault("gateway", {})
gateway["mode"] = "local"
gateway["bind"] = "lan"
control_ui = gateway.setdefault("controlUi", {})
control_ui["allowedOrigins"] = allowed_origins
control_ui["dangerouslyDisableDeviceAuth"] = disable_device_auth

logging = data.setdefault("logging", {})
logging["level"] = logging.get("level", "info")

os.makedirs(os.path.dirname(cfg), exist_ok=True)
with open(cfg, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
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
