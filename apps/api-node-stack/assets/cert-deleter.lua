local cjson = require("cjson")

local function normalize_domain(domain)
    if type(domain) ~= "string" then
        return nil
    end
    domain = domain:lower()
    if not domain:match("^[a-z0-9%.%-]+$") then
        return nil
    end
    return domain
end

local function normalize_tenant_name(name)
    if type(name) ~= "string" then
        return nil
    end
    if not name:match("^[a-zA-Z0-9%-]+$") then
        return nil
    end
    return name
end

ngx.req.read_body()
local body = ngx.req.get_body_data()

if not body then
    ngx.status = 400
    ngx.say(cjson.encode({success = false, error = "Missing request body"}))
    return ngx.exit(400)
end

local ok, data = pcall(cjson.decode, body)
if not ok or type(data) ~= "table" then
    ngx.status = 400
    ngx.say(cjson.encode({success = false, error = "Invalid JSON payload"}))
    return ngx.exit(400)
end

local tenant_name = normalize_tenant_name(data.tenant_name)
local domain = normalize_domain(data.domain)

if not domain then
    if tenant_name then
        domain = tenant_name .. ".test.api.corbits.dev"
    else
        ngx.status = 400
        ngx.say(cjson.encode({success = false, error = "Missing domain"}))
        return ngx.exit(400)
    end
end

if not tenant_name and data.tenant_name ~= nil then
    ngx.status = 400
    ngx.say(cjson.encode({success = false, error = "Invalid tenant_name format"}))
    return ngx.exit(400)
end

tenant_name = tenant_name or domain

local cmd = string.format(
    "sudo /usr/local/bin/delete-tenant-cert '%s' 2>&1; echo EXIT_CODE:$?",
    domain
)
local handle = io.popen(cmd)
local result = handle:read("*a")
handle:close()

local exit_code = tonumber(result:match("EXIT_CODE:(%d+)")) or 1
result = result:gsub("EXIT_CODE:%d+%s*$", "")

if exit_code == 0 then
    ngx.say(cjson.encode({
        success = true,
        tenant_name = tenant_name,
        domain = domain
    }))
else
    ngx.status = 500
    ngx.say(cjson.encode({
        success = false,
        tenant_name = tenant_name,
        error = result,
        exit_code = exit_code
    }))
    return ngx.exit(500)
end
