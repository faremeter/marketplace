#!/usr/bin/env opsh
# shellcheck shell=bash

lib::import step-runner

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$SCRIPT_DIR/../control-plane-stack"
REMOTE_DIR="/home/admin/control-plane"
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
        --exclude='.git' \
        --exclude='.env' \
        --exclude='deploy.sh' \
        --exclude='*.tar.gz' \
        --exclude='.DS_Store' \
        --exclude='.tap' \
        --exclude='*.swp' \
        --exclude='backups' \
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

# Run on first stack only (shared database)
first_stack_only() {
    local original_stack
    original_stack=$(pulumi stack --show-name 2>/dev/null)
    local stack="${CONTROL_PLANE_STACKS[0]}"
    log::info "[$stack] $1"
    pulumi stack select "$stack" >/dev/null 2>&1
    get_ssh_details $SERVER_INDEX
    eval "$2"
    pulumi stack select "$original_stack" >/dev/null 2>&1
}

step::10::verify-environment() {
    log::info "verifying environment..."

    if [ ! -f "$SCRIPT_DIR/package.json" ]; then
        log::fatal "Must run from control-plane directory"
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

step::50::migrate() {
    # shellcheck disable=SC2016
    # Only run on first stack - all stacks share the same database
    first_stack_only "running migrations..." 'remote::exec "cd $REMOTE_DIR && npm run migrate"'
}

step::60::deploy() {
    # shellcheck disable=SC2016
    # Restart each stack before moving to next (minimizes per-stack downtime)
    for_each_stack "restarting service..." 'remote::exec "sudo systemctl restart control-plane"'
}

step::70::verify() {
    for_each_stack "verifying service..." 'remote::exec "sudo systemctl status control-plane --no-pager || true"'
}

steps::run "step" "$@"
