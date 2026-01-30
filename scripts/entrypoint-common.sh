#!/bin/bash
# Common helpers for OpenClaw RunPod entrypoints.

oc_init_web_ui() {
    local pod_id="${RUNPOD_POD_ID:-}"
    if [ -n "$pod_id" ]; then
        WEB_UI_BASE="https://${pod_id}-18789.proxy.runpod.net"
    else
        WEB_UI_BASE="https://<pod-id>-18789.proxy.runpod.net"
    fi

    WEB_UI_TOKEN="${OPENCLAW_WEB_PASSWORD:-openclaw}"
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

oc_setup_ssh_manual() {
    echo "Initializing SSH..."

    if [ -n "${PUBLIC_KEY:-}" ]; then
        mkdir -p ~/.ssh
        echo "$PUBLIC_KEY" > ~/.ssh/authorized_keys
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

oc_start_runpod_ssh() {
    if [ -f /start.sh ]; then
        echo "Starting SSH setup..."
        /start.sh >/var/log/runpod-start.log 2>&1 &
        sleep 5
    fi
}
