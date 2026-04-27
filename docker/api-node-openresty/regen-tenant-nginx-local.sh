#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${CONFIG_FILE:-/etc/nginx/tenant-config.json}"
OUTPUT_FILE="${OUTPUT_FILE:-/var/local/api-node/marketplace.conf}"
TMP_FILE="$(mktemp /var/local/api-node/marketplace.conf.XXXXXX)"
TEST_CONF="$(mktemp /var/local/api-node/marketplace.conf.test.XXXXXX)"
TEST_ROOT_CONF="$(mktemp /var/local/api-node/nginx-test.conf.XXXXXX)"

cleanup() {
  rm -f "$TMP_FILE"
  rm -f "$TEST_CONF"
  rm -f "$TEST_ROOT_CONF"
}

trap cleanup EXIT

cat <<'EOF' >"$TMP_FILE"
server {
    listen 80 default_server;
    server_name _;

    location = /health {
        return 200 'ok';
        add_header Content-Type text/plain;
    }

    location = /internal/config {
        client_max_body_size 5m;
        content_by_lua_file /etc/nginx/config-receiver-local.lua;
    }

    location / {
        return 404;
    }
}
EOF

if [[ -f "$CONFIG_FILE" ]] && [[ -s "$CONFIG_FILE" ]]; then
  TENANT_ENTRIES=$(jq -r '.config // {} | keys[]' "$CONFIG_FILE" 2>/dev/null) || true

  if [[ -n "$TENANT_ENTRIES" ]]; then
    while read -r domain; do
      if [[ -z "$domain" ]]; then
        continue
      fi

      TENANT_SLUG=$(jq -r --arg d "$domain" '.config[$d].gateway_slug // empty' "$CONFIG_FILE")

      if [[ -n "$TENANT_SLUG" && -f "/etc/faremeter-gateway/${TENANT_SLUG}/locations.conf" ]]; then
        cat <<EOF >>"$TMP_FILE"

server {
    listen 80;
    server_name ${domain};

    resolver 127.0.0.11 ipv6=off valid=30s;
    resolver_timeout 5s;

    set \$backend_url "";
    set \$backend_host "";

    location = /health {
        access_by_lua_block { return }
        return 200 'ok';
        add_header Content-Type text/plain;
    }

    access_by_lua_file /etc/nginx/upstream-auth.lua;

    include /etc/faremeter-gateway/${TENANT_SLUG}/locations.conf;
    include /etc/nginx/free-fallback.conf.inc;
}
EOF
      else
        cat <<EOF >>"$TMP_FILE"

server {
    listen 80;
    server_name ${domain};

    resolver 127.0.0.11 ipv6=off valid=30s;
    resolver_timeout 5s;

    set \$backend_url "";
    set \$backend_host "";

    location = /health {
        access_by_lua_block { return }
        return 200 'ok';
        add_header Content-Type text/plain;
    }

    access_by_lua_file /etc/nginx/upstream-auth.lua;

    include /etc/nginx/free-fallback.conf.inc;
}
EOF
      fi
    done <<<"$TENANT_ENTRIES"
  fi
fi

cp "$TMP_FILE" "$TEST_CONF"

cat >"$TEST_ROOT_CONF" <<EOF
user root;
worker_processes auto;
pid /usr/local/openresty/nginx/logs/nginx-test.pid;

events {
    worker_connections 1024;
}

http {
    server_names_hash_bucket_size 128;

    lua_package_path "/etc/nginx/?.lua;/etc/faremeter-gateway/?.lua;/etc/faremeter-gateway/*/?.lua;/usr/local/openresty/site/lualib/?.lua;/usr/local/openresty/lualib/?.lua;;";
    lua_shared_dict tenants 10m;
    lua_shared_dict word_dict 10m;
    lua_shared_dict fm_capture_buffer 10m;
    lua_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
    lua_ssl_verify_depth 2;

    init_by_lua_file /etc/nginx/init-config.lua;

    include $TEST_CONF;
}
EOF

if ! openresty -t -c "$TEST_ROOT_CONF"; then
  exit 1
fi

mv "$TMP_FILE" "$OUTPUT_FILE"
chmod 0666 "$OUTPUT_FILE"

PID_FILE=/usr/local/openresty/nginx/logs/nginx.pid
if [[ -s "$PID_FILE" ]]; then
  PID_CONTENT=$(tr -d '[:space:]' <"$PID_FILE")
  if [[ "$PID_CONTENT" =~ ^[0-9]+$ ]]; then
    openresty -s reload
  fi
fi
