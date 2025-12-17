#!/usr/bin/env opsh
# shellcheck shell=bash

lib::import step-runner

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$SCRIPT_DIR/../control-plane-stack"
REMOTE_DIR="/home/admin/control-plane"
SERVER_INDEX=0

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

step::00::verify-environment() {
    log::info "verifying environment..."

    if [ ! -f "$SCRIPT_DIR/package.json" ]; then
        log::fatal "Must run from control-plane directory"
    fi

    if [ ! -d "$STACK_DIR" ]; then
        log::fatal "Stack directory not found at $STACK_DIR"
    fi
}

step::10::get-connection() {
    log::info "getting SSH connection details from Pulumi..."
    cd "$STACK_DIR" || log::fatal "failed to cd to $STACK_DIR"
    get_ssh_details $SERVER_INDEX
    log::info "connecting to $SSH_USER@$SSH_HOST"
}

step::20::sync-files() {
    log::info "syncing files to server..."
    cd "$SCRIPT_DIR" || log::fatal "failed to cd to $SCRIPT_DIR"

    rsync -avz --delete \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='.env' \
        --exclude='*.tar.gz' \
        --exclude='.DS_Store' \
        --exclude='.tap' \
        --exclude='*.swp' \
        --exclude='backups' \
        -e "ssh -o StrictHostKeyChecking=off -o UserKnownHostsFile=/dev/null -i $PRIVKEY" \
        ./ "$SSH_USER@$SSH_HOST:$REMOTE_DIR/"
}

step::30::install-dependencies() {
    log::info "installing npm dependencies..."
    remote::exec "cd $REMOTE_DIR && npm install"
}

step::40::run-migrations() {
    log::info "running database migrations..."
    remote::exec "cd $REMOTE_DIR && npm run migrate"
}

step::50::restart-services() {
    log::info "restarting services..."
    remote::exec "sudo systemctl restart control-plane"
}

step::99::check-status() {
    log::info "checking service status..."
    remote::exec "sudo systemctl status control-plane --no-pager || true"
}

steps::run "step" "$@"
