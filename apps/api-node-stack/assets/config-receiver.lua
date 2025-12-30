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

ngx.shared.tenants:flush_all()

local count = 0
for api_key, tenant_config in pairs(config.config) do
    local tenant_name = tenant_config.name
    if tenant_name then
        ngx.shared.tenants:set(tenant_name, cjson.encode(tenant_config))
        count = count + 1
    end
end

local config_file = io.open("/etc/nginx/tenant-config.json", "w")
if config_file then
    config_file:write(body)
    config_file:close()
    os.execute("sudo /usr/local/bin/regen-tenant-nginx")
end

ngx.header["Content-Type"] = "application/json"
ngx.say(cjson.encode({success = true, tenant_count = count}))
