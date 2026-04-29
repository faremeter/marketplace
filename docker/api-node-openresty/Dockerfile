FROM openresty/openresty:1.27.1.2-0-bookworm-fat

RUN opm get ledgetech/lua-resty-http \
  && apt-get update \
  && apt-get install -y --no-install-recommends bash curl jq ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY docker/api-node-openresty/nginx.conf /usr/local/openresty/nginx/conf/nginx.conf
COPY docker/api-node-openresty/start.sh /usr/local/bin/start-api-node-local
COPY docker/api-node-openresty/regen-tenant-nginx-local.sh /usr/local/bin/regen-tenant-nginx-local
COPY docker/api-node-openresty/config-receiver-local.lua /etc/nginx/config-receiver-local.lua

COPY apps/api-node-stack/assets/init-config.lua /etc/nginx/init-config.lua
COPY apps/api-node-stack/assets/upstream-auth.lua /etc/nginx/upstream-auth.lua
COPY apps/api-node-stack/assets/free-recording.lua /etc/nginx/free-recording.lua
COPY apps/api-node-stack/assets/control-plane-client.lua /etc/nginx/control-plane-client.lua
COPY apps/api-node-stack/assets/tenant-request.lua /etc/nginx/tenant-request.lua
COPY apps/api-node-stack/assets/free-fallback.conf.inc /etc/nginx/free-fallback.conf.inc

RUN chmod +x /usr/local/bin/start-api-node-local /usr/local/bin/regen-tenant-nginx-local

CMD ["/usr/local/bin/start-api-node-local"]
