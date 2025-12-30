#!/usr/bin/env opsh
# shellcheck shell=bash
set -e

lib::import step-runner

ASSETS_DIR="$(cd "$SCRIPTDIR/assets" && pwd)"
cd "$SCRIPTDIR/../api-node-stack" || exit 1

API_NODE_STACKS=("production-1" "production-2")

log::warn "This script will deploy to stacks: $(printf '%s, ' "${API_NODE_STACKS[@]}" | sed 's/, $//')"
log::warn "Current stack will be restored after completion."
read -rp "Continue? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || exit 0

copy() { cat "$ASSETS_DIR/$1" | ../../bin/ssh-to-host 0 "$2"; }
run() { ../../bin/ssh-to-host 0 "$1" </dev/null; }

for_each_stack() {
    local original_stack
    original_stack=$(pulumi stack --show-name 2>/dev/null)
    for stack in "${API_NODE_STACKS[@]}"; do
        log::info "[$stack] $1"
        pulumi stack select "$stack" >/dev/null 2>&1
        eval "$2"
    done
    pulumi stack select "$original_stack" >/dev/null 2>&1
}

step::10::install-dictionary() {
    for_each_stack "installing wamerican dictionary..." \
        'run "dpkg -s wamerican >/dev/null 2>&1 || sudo apt-get install -y wamerican"'
}

step::20::upload-config() {
    for_each_stack "uploading perftest nginx config..." \
        'copy perftest.conf "sudo tee /etc/nginx/sites-available/perftest > /dev/null"'
}

step::30::enable-site() {
    for_each_stack "enabling perftest site..." \
        'run "sudo ln -sf /etc/nginx/sites-available/perftest /etc/nginx/sites-enabled/perftest && sudo nginx -t && sudo systemctl reload nginx"'
}

step::40::update-tenant() {
    log::info "updating perftest tenant backend_url..."
    # shellcheck disable=SC2016
    run 'curl -sf http://10.12.0.1:1337/api/tenants \
        | jq -r ".[] | select(.name==\"perftest\") | .id" \
        | xargs -I{} curl -sf -X PUT "http://10.12.0.1:1337/api/tenants/{}" \
            -H "Content-Type: application/json" \
            -d "{\"backend_url\": \"http://127.0.0.1:3002\"}"'
}

steps::run "step" "$@"
