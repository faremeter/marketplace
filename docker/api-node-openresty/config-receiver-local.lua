local cjson = require("cjson")

local live_config_path = "/etc/nginx/tenant-config.json"
local pending_config_path = "/var/local/api-node/tenant-config.pending.json"
local sidecar_config_path = "/etc/faremeter-sidecar/config.json"

local function localize_locations_conf(conf, slug)
    local tenant_path = "/etc/faremeter-gateway/" .. slug .. "/?.lua;"
    local localized = conf:gsub(
        'local fm = require%("faremeter"%)',
        'package.path = "' .. tenant_path .. '" .. package.path\n      local fm = require("faremeter")'
    )
    return localized
end

local function normalize_sidecar_rules(value)
    if type(value) ~= "table" then
        return
    end

    for key, nested in pairs(value) do
        if key == "match" and nested == "true" then
            value[key] = "$"
        else
            normalize_sidecar_rules(nested)
        end
    end
end

ngx.req.read_body()
local body = ngx.req.get_body_data()

if not body then
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
    ngx.status = 400
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({error = "No body provided"}))
    return ngx.exit(400)
end

local ok, config = pcall(cjson.decode, body)
if not ok then
    ngx.status = 400
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({error = "Invalid JSON"}))
    return ngx.exit(400)
end

if not config.config then
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

local config_file = io.open(pending_config_path, "w")
if not config_file then
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({error = "Failed to write pending tenant config"}))
    return ngx.exit(500)
end

config_file:write(body)
config_file:close()

if config.gateway then
    for slug, artifacts in pairs(config.gateway) do
        if not slug:match("^[a-z0-9%-]+$") then
            ngx.log(ngx.ERR, "Invalid gateway slug, skipping: ", slug)
            goto continue_gateway
        end

        local dir = "/etc/faremeter-gateway/" .. slug
        os.execute("mkdir -p " .. dir)

        if artifacts.locationsConf then
            local lf = io.open(dir .. "/locations.conf", "w")
            if lf then
                lf:write(localize_locations_conf(artifacts.locationsConf, slug))
                lf:close()
            end
        end

        if artifacts.luaFiles then
            for filename, content in pairs(artifacts.luaFiles) do
                if not filename:find("/") and not filename:find("%.%.") then
                    local lf = io.open(dir .. "/" .. filename, "w")
                    if lf then
                        lf:write(content)
                        lf:close()
                    end
                end
            end
        end

        ::continue_gateway::
    end
end

local regen_ok, regen_reason, regen_code = os.execute("CONFIG_FILE=" .. pending_config_path .. " /usr/local/bin/regen-tenant-nginx-local")
local regen_succeeded = regen_ok == true or regen_ok == 0
if not regen_succeeded then
    ngx.log(
        ngx.ERR,
        "regen-tenant-nginx-local failed: ok=",
        tostring(regen_ok),
        ", reason=",
        tostring(regen_reason),
        ", code=",
        tostring(regen_code)
    )
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({
        error = "Failed to regenerate nginx config",
    }))
    return ngx.exit(500)
end

local live_config_file = io.open(live_config_path, "w")
if not live_config_file then
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({error = "Failed to write tenant-config.json"}))
    return ngx.exit(500)
end

live_config_file:write(body)
live_config_file:close()

ngx.shared.tenants:flush_all()
for key, value in pairs(tenant_entries) do
    ngx.shared.tenants:set(key, value)
end

if config.sidecar then
    normalize_sidecar_rules(config.sidecar)
    local sf = io.open(sidecar_config_path, "w")
    if sf then
        sf:write(cjson.encode(config.sidecar))
        sf:close()
    end
end

ngx.header["Content-Type"] = "application/json"
ngx.say(cjson.encode({
    success = true,
    tenant_count = count,
}))
