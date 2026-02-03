#!/usr/bin/env opsh
# shellcheck shell=bash

lib::import step-runner

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$SCRIPT_DIR/../control-plane-stack"
SERVER_INDEX=0

# Blue-green deployment directories
BLUE_DIR="/home/admin/control-plane-blue"
GREEN_DIR="/home/admin/control-plane-green"
SYMLINK_DIR="/home/admin/control-plane"

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

get_active_release() {
    remote::exec "readlink $SYMLINK_DIR 2>/dev/null || echo ''"
}

get_inactive_release() {
    local active
    active=$(get_active_release)
    if [[ "$active" == "$BLUE_DIR" ]]; then
        echo "$GREEN_DIR"
    else
        echo "$BLUE_DIR"
    fi
}

remote::sync() {
    local target_dir
    target_dir=$(get_inactive_release)
    log::info "  -> syncing to $target_dir"
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
        "$SCRIPT_DIR/" "$SSH_USER@$SSH_HOST:$target_dir/"
}

for_each_stack() {
    local original_stack
    original_stack=$(pulumi stack --show-name 2>/dev/null)
    for stack in "${CONTROL_PLANE_STACKS[@]}"; do
        log::info "[$stack] $1"
        pulumi stack select "$stack" >/dev/null 2>&1
        get_ssh_details $SERVER_INDEX
        if ! eval "$2"; then
            pulumi stack select "$original_stack" >/dev/null 2>&1
            log::fatal "[$stack] Failed: $1"
        fi
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
    if ! eval "$2"; then
        pulumi stack select "$original_stack" >/dev/null 2>&1
        log::fatal "[$stack] Failed: $1"
    fi
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

step::15::setup-blue-green() {
    # shellcheck disable=SC2016
    for_each_stack "setting up blue-green directories..." 'remote::exec "mkdir -p $BLUE_DIR $GREEN_DIR && if [ -d $SYMLINK_DIR ] && [ ! -L $SYMLINK_DIR ]; then rm -rf $BLUE_DIR; mv $SYMLINK_DIR $BLUE_DIR; fi && [ -L $SYMLINK_DIR ] || ln -sfn $BLUE_DIR $SYMLINK_DIR"'
}

step::20::typecheck() {
    log::info "typechecking locally..."
    cd "$SCRIPT_DIR" || log::fatal "failed to cd to $SCRIPT_DIR"
    npx tsc --noEmit
    cd "$STACK_DIR" || log::fatal "failed to cd to $STACK_DIR"
}

step::25::copy-shared-packages() {
    log::info "copying shared packages..."
    rm -rf "$SCRIPT_DIR/.local-packages"
    mkdir -p "$SCRIPT_DIR/.local-packages/@1click"
    cp -r "$SCRIPT_DIR/../../packages/db-schema" "$SCRIPT_DIR/.local-packages/@1click/db-schema"
    cp -r "$SCRIPT_DIR/../../packages/test-db" "$SCRIPT_DIR/.local-packages/@1click/test-db"
    cat <<'EOF' >"$SCRIPT_DIR/pnpm-workspace.yaml"
packages:
  - ".local-packages/@1click/*"
EOF
}

step::30::sync() {
    for_each_stack "syncing files..." 'remote::sync'
    rm -rf "$SCRIPT_DIR/.local-packages"
    rm -f "$SCRIPT_DIR/pnpm-workspace.yaml"
}

step::40::install() {
    # shellcheck disable=SC2016
    for_each_stack "installing dependencies..." '
        target_dir=$(get_inactive_release)
        log::info "  -> installing in $target_dir"
        remote::exec "cp $SYMLINK_DIR/.env $target_dir/.env 2>/dev/null || true"
        remote::exec "rm -rf $target_dir/node_modules && cd $target_dir && pnpm install"
    '
}

step::50::migrate() {
    # shellcheck disable=SC2016
    first_stack_only "running migrations..." '
        target_dir=$(get_inactive_release)
        log::info "  -> migrating from $target_dir"
        remote::exec "cd $target_dir && npm run migrate"
    '
}

step::60::deploy() {
    # shellcheck disable=SC2016
    for_each_stack "switching release and restarting..." '
        target_dir=$(get_inactive_release)
        log::info "  -> switching to $target_dir"
        remote::exec "cp $SYMLINK_DIR/.env $target_dir/.env 2>/dev/null || true"
        remote::exec "ln -sfn $target_dir $SYMLINK_DIR"
        remote::exec "sudo systemctl restart control-plane"
    '
}

step::70::verify() {
    for_each_stack "verifying service..." 'remote::exec "sudo systemctl status control-plane --no-pager" || true'
}

steps::run "step" "$@"
