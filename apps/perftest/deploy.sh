#!/usr/bin/env opsh
# shellcheck shell=bash
set -e

lib::import step-runner

# Save absolute path before changing directory
ASSETS_DIR="$(cd "$SCRIPTDIR/assets" && pwd)"
cd "$SCRIPTDIR/../api-node-stack" || exit 1

copy() { cat "$ASSETS_DIR/$1" | ../../bin/ssh-to-host 0 "$2"; }
run() { ../../bin/ssh-to-host 0 "$1" </dev/null; }

step::00::check-stack() {
    log::info "checking pulumi stack..."
    local current_stack
    current_stack=$(pulumi stack --show-name 2>/dev/null)
    if [[ "$current_stack" != "production-1" ]]; then
        log::fatal "perftest can only be deployed to production-1, current stack is '$current_stack'. Run: pulumi stack select production-1"
    fi
    log::info "deploying to stack: $current_stack"
}

step::10::install-dictionary() {
    log::info "installing wamerican dictionary..."
    run "dpkg -s wamerican >/dev/null 2>&1 || sudo apt-get install -y wamerican"
}

step::20::add-shared-dict() {
    log::info "adding lua_shared_dict word_dict to api-node config..."
    run "grep -q 'lua_shared_dict word_dict' /etc/nginx/sites-available/api-node || sudo sed -i '/lua_shared_dict tenants/a lua_shared_dict word_dict 10m;' /etc/nginx/sites-available/api-node"
}

step::30::upload-config() {
    log::info "uploading perftest nginx config..."
    copy perftest.conf "sudo tee /etc/nginx/sites-available/perftest > /dev/null"
}

step::40::enable-site() {
    log::info "enabling perftest site..."
    run "sudo ln -sf /etc/nginx/sites-available/perftest /etc/nginx/sites-enabled/perftest"
    run "sudo nginx -t && sudo systemctl reload nginx"
}

step::50::update-tenant() {
    log::info "updating perftest tenant backend_url..."
    # shellcheck disable=SC2016
    run 'id=$(curl -s http://10.12.0.1:1337/api/tenants | jq -r ".[] | select(.name==\"perftest\") | .id")
        curl -s -X PUT "http://10.12.0.1:1337/api/tenants/$id" \
            -H "Content-Type: application/json" \
            -d "{\"backend_url\": \"http://127.0.0.1:3002\"}" | jq -r .name'
}

steps::run "step" "$@"
