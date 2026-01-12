local cjson = require("cjson")

local config_path = "/etc/nginx/tenant-config.json"
local file = io.open(config_path, "r")

if not file then
    ngx.log(ngx.WARN, "No tenant config file found at ", config_path)
    return
end

local content = file:read("*all")
file:close()

if not content or content == "" then
    ngx.log(ngx.WARN, "Tenant config file is empty")
    return
end

local ok, config = pcall(cjson.decode, content)
if not ok then
    ngx.log(ngx.ERR, "Failed to parse tenant config: ", config)
    return
end

if not config.config then
    ngx.log(ngx.WARN, "No config field in tenant config")
    return
end

local count = 0
for domain, tenant_config in pairs(config.config) do
    local key = tenant_config.domain or domain
    if key then
        ngx.shared.tenants:set(key, cjson.encode(tenant_config))
        count = count + 1
    end
end

ngx.log(ngx.INFO, "Loaded ", count, " tenants from config file")
