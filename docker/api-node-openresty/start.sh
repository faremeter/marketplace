#!/usr/bin/env bash
set -euo pipefail

STATE_DIR=/var/local/api-node
GATEWAY_DIR="$STATE_DIR/gateway"
SIDECAR_DIR="$STATE_DIR/sidecar"
TENANT_CONFIG="$STATE_DIR/tenant-config.json"
MARKETPLACE_CONF="$STATE_DIR/marketplace.conf"

mkdir -p "$GATEWAY_DIR" "$SIDECAR_DIR" /etc/nginx/conf.d

if [[ ! -f "$TENANT_CONFIG" ]]; then
  cat <<'EOF' >"$TENANT_CONFIG"
{"config":{},"gateway":{},"sidecar":{"sites":{}}}
EOF
fi

if [[ ! -f "$SIDECAR_DIR/config.json" ]]; then
  cat <<'EOF' >"$SIDECAR_DIR/config.json"
{"sites":{}}
EOF
fi

chmod 0777 "$STATE_DIR" "$GATEWAY_DIR" "$SIDECAR_DIR"
chmod 0666 "$TENANT_CONFIG" "$SIDECAR_DIR/config.json"
touch "$MARKETPLACE_CONF"
chmod 0666 "$MARKETPLACE_CONF"

rm -rf /etc/faremeter-gateway /etc/faremeter-sidecar /etc/nginx/tenant-config.json
rm -f /etc/nginx/conf.d/marketplace.conf
ln -s "$GATEWAY_DIR" /etc/faremeter-gateway
ln -s "$SIDECAR_DIR" /etc/faremeter-sidecar
ln -s "$TENANT_CONFIG" /etc/nginx/tenant-config.json
ln -s "$MARKETPLACE_CONF" /etc/nginx/conf.d/marketplace.conf

printf '%s\n' "${CONTROL_PLANE_ADDRS:-control-plane:1337}" > /etc/nginx/control-plane-addrs.conf

/usr/local/bin/regen-tenant-nginx-local

exec openresty -g "daemon off;"
