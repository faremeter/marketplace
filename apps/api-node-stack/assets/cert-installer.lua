local cjson = require("cjson")

ngx.req.read_body()
local body = ngx.req.get_body_data()

if not body then
    ngx.status = 400
    ngx.say(cjson.encode({success = false, error = "Missing request body"}))
    return ngx.exit(400)
end

local ok, data = pcall(cjson.decode, body)
if not ok or not data.tenant_name or not data.fullchain or not data.privkey then
    ngx.status = 400
    ngx.say(cjson.encode({success = false, error = "Missing required fields"}))
    return ngx.exit(400)
end

local tenant_name = data.tenant_name

-- Validate tenant name (alphanumeric and hyphens only)
if not tenant_name:match("^[a-zA-Z0-9%-]+$") then
    ngx.status = 400
    ngx.say(cjson.encode({success = false, error = "Invalid tenant_name format"}))
    return ngx.exit(400)
end

local domain = tenant_name .. ".test.api.corbits.dev"

-- Base64 encode certs to pass safely through shell
local fullchain_b64 = ngx.encode_base64(data.fullchain)
local privkey_b64 = ngx.encode_base64(data.privkey)

-- Run install script with base64-encoded certs
local cmd = string.format(
    "sudo /usr/local/bin/install-tenant-cert '%s' '%s' '%s' 2>&1; echo EXIT_CODE:$?",
    domain,
    fullchain_b64,
    privkey_b64
)
local handle = io.popen(cmd)
local result = handle:read("*a")
handle:close()

-- Parse exit code from output
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
