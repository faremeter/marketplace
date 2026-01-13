local cjson = require("cjson")

ngx.req.read_body()
local body = ngx.req.get_body_data()

if not body then
    -- Body might be in a temp file if too large
    local body_file = ngx.req.get_body_file()
    if body_file then
        local f = io.open(body_file, "r")
        if f then
            body = f:read("*all")
            f:close()
        end
    end
end

if not body then
    ngx.log(ngx.ERR, "No body provided")
    ngx.status = 400
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({error = "No body provided"}))
    return ngx.exit(400)
end

local ok, config = pcall(cjson.decode, body)
if not ok then
    ngx.log(ngx.ERR, "Invalid JSON: ", config)
    ngx.status = 400
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({error = "Invalid JSON"}))
    return ngx.exit(400)
end

if not config.config then
    ngx.log(ngx.ERR, "Missing config field")
    ngx.status = 400
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({error = "Missing config field"}))
    return ngx.exit(400)
end

local tenant_entries = {}
local count = 0
for domain, tenant_config in pairs(config.config) do
    local key = tenant_config.domain or domain
    if key then
        tenant_entries[key] = cjson.encode(tenant_config)
        count = count + 1
    end
end

ngx.shared.tenants:flush_all()
for key, value in pairs(tenant_entries) do
    ngx.shared.tenants:set(key, value)
end

local config_file = io.open("/etc/nginx/tenant-config.json", "w")
if config_file then
    config_file:write(body)
    config_file:close()
    local regen_result = os.execute("sudo -u tenantmgr /usr/local/bin/regen-tenant-nginx")
    if regen_result ~= 0 then
        ngx.log(ngx.ERR, "regen-tenant-nginx failed with exit code: ", regen_result)
    end
else
    ngx.log(ngx.ERR, "Failed to write tenant-config.json")
end

ngx.header["Content-Type"] = "application/json"
ngx.say(cjson.encode({success = true, tenant_count = count}))
