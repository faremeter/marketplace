#!/usr/bin/env opsh
# shellcheck shell=bash

lib::import step-runner

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$SCRIPT_DIR/../control-plane-stack"
REMOTE_DIR="/home/admin/control-plane-ui"
SERVER_INDEX=0

CONTROL_PLANE_STACKS=("production-1" "production-2")

log::warn "This script will deploy to stacks: $(printf '%s, ' "${CONTROL_PLANE_STACKS[@]}" | sed 's/, $//')"
log::warn "Current stack will be restored after completion."
read -rp "Continue? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || exit 0

get_ssh_details() {
    local hostindex=$1

    PRIVKEY="$(temp::file)"
    chmod 600 "$PRIVKEY"

    local connection
    connection="$(pulumi stack output --show-secrets nodes | jq -r ".[$hostindex]"'.connection as
  {privateKey: $private_key, $user, $host}
    ?// {$private_key, $user, $host}
    | {privateKey: ($private_key // error), $user, $host}
')"

    jq -r '.privateKey' <<<"$connection" >"$PRIVKEY"
    SSH_USER=$(jq -r '.user' <<<"$connection")
    SSH_HOST=$(jq -r '.host' <<<"$connection")
}

remote::exec() {
    ssh -o StrictHostKeyChecking=off -o UserKnownHostsFile=/dev/null -i "$PRIVKEY" "$SSH_USER@$SSH_HOST" "$@" </dev/null
}

remote::sync() {
    rsync -avz --delete \
        --exclude='node_modules' \
        --exclude='.next' \
        --exclude='.git' \
        --exclude='.env' \
        --exclude='deploy.sh' \
        --exclude='*.tar.gz' \
        --exclude='.DS_Store' \
        --exclude='*.swp' \
        -e "ssh -o StrictHostKeyChecking=off -o UserKnownHostsFile=/dev/null -i $PRIVKEY" \
        "$SCRIPT_DIR/" "$SSH_USER@$SSH_HOST:$REMOTE_DIR/"
}

for_each_stack() {
    local original_stack
    original_stack=$(pulumi stack --show-name 2>/dev/null)
    for stack in "${CONTROL_PLANE_STACKS[@]}"; do
        log::info "[$stack] $1"
        pulumi stack select "$stack" >/dev/null 2>&1
        get_ssh_details $SERVER_INDEX
        eval "$2"
    done
    pulumi stack select "$original_stack" >/dev/null 2>&1
}

step::10::verify-environment() {
    log::info "verifying environment..."

    if [ ! -f "$SCRIPT_DIR/package.json" ]; then
        log::fatal "Must run from control-plane-ui directory"
    fi

    if [ ! -d "$STACK_DIR" ]; then
        log::fatal "Stack directory not found at $STACK_DIR"
    fi

    cd "$STACK_DIR" || log::fatal "failed to cd to $STACK_DIR"
}

step::20::typecheck() {
    log::info "typechecking locally..."
    cd "$SCRIPT_DIR" || log::fatal "failed to cd to $SCRIPT_DIR"
    npx tsc --noEmit
    cd "$STACK_DIR" || log::fatal "failed to cd to $STACK_DIR"
}

step::30::sync() {
    for_each_stack "syncing files..." 'remote::sync'
}

step::40::install() {
    # shellcheck disable=SC2016
    for_each_stack "installing dependencies..." 'remote::exec "cd $REMOTE_DIR && npm install"'
}

step::50::setup() {
    # shellcheck disable=SC2016
    for_each_stack "setting up systemd and nginx..." 'remote::exec "sudo cp $REMOTE_DIR/assets/control-plane-ui.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable control-plane-ui && sudo cp $REMOTE_DIR/assets/60_control_plane_ui.conf /etc/nginx/sites-available/control-plane.d/ && sudo nginx -t && sudo systemctl reload nginx"'
}

step::60::deploy() {
    # shellcheck disable=SC2016
    # Stop, build, restart each stack before moving to next (minimizes per-stack downtime)
    for_each_stack "building and deploying..." 'remote::exec "cd $REMOTE_DIR && sudo systemctl stop control-plane-ui && rm -rf .next/server .next/static .next/BUILD_ID && npm run build && sudo systemctl start control-plane-ui"'
}

step::70::verify() {
    for_each_stack "verifying service..." 'remote::exec "sudo systemctl status control-plane-ui --no-pager || true"'
}

steps::run "step" "$@"
