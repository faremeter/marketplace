local cjson = require("cjson")
local tenant_request = require("tenant-request")

local host = ngx.var.host

local tenant_json = ngx.shared.tenants:get(host)
if not tenant_json then
    ngx.log(ngx.ERR, "Tenant config not found for host: ", host)
    return ngx.exit(404)
end

local ok, tenant_config = pcall(cjson.decode, tenant_json)
if not ok then
    ngx.log(ngx.ERR, "Failed to parse tenant config for host: ", host, ": ", tenant_config)
    return ngx.exit(502)
end

local backend_url = tenant_config.backend_url
if not backend_url or backend_url == cjson.null or backend_url == "" then
    ngx.log(ngx.ERR, "No backend_url configured for host: ", host)
    return ngx.exit(502)
end

tenant_request.resolve_backend(backend_url)
tenant_request.inject_auth(tenant_config)
