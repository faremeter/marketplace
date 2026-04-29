local cjson = require("cjson")

local live_config_path = "/etc/nginx/tenant-config.json"
local pending_config_path = "/var/local/api-node/tenant-config.pending.json"
local sidecar_config_path = "/etc/faremeter-sidecar/config.json"
local gateway_root = "/etc/faremeter-gateway"

local function localize_locations_conf(conf, slug)
    local tenant_path = "/etc/faremeter-gateway/" .. slug .. "/?.lua;"
    local localized = conf:gsub(
        'local fm = require%("faremeter"%)',
        'package.path = "' .. tenant_path .. '" .. package.path\n      local fm = require("faremeter")'
    )
    return localized
end

local function json_response(status, payload)
    ngx.status = status
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode(payload))
    return ngx.exit(status)
end

local function is_valid_gateway_slug(value)
    return type(value) == "string" and value:match("^[a-z0-9%-]+$") ~= nil
end

local function is_safe_lua_filename(value)
    return type(value) == "string" and not value:find("/") and not value:find("%.%.") and value ~= "locations.conf"
end

local function remove_tree(path)
    os.execute("rm -rf " .. path)
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
    return json_response(400, {error = "No body provided"})
end

local ok, config = pcall(cjson.decode, body)
if not ok then
    return json_response(400, {error = "Invalid JSON"})
end

if not config.config then
    return json_response(400, {error = "Missing config field"})
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

local failed_slugs = {}

local config_file = io.open(pending_config_path, "w")
if not config_file then
    return json_response(500, {error = "Failed to write pending tenant config"})
end

config_file:write(body)
config_file:close()

if config.gateway then
    for slug, artifacts in pairs(config.gateway) do
        if not is_valid_gateway_slug(slug) then
            ngx.log(ngx.ERR, "Invalid gateway slug, skipping: ", slug)
            failed_slugs[#failed_slugs + 1] = slug
            goto continue_gateway
        end

        local dir = gateway_root .. "/" .. slug
        local mkdir_result = os.execute("mkdir -p " .. dir)
        if mkdir_result ~= true and mkdir_result ~= 0 then
            ngx.log(ngx.ERR, "Failed to create gateway directory: ", dir)
            failed_slugs[#failed_slugs + 1] = slug
            goto continue_gateway
        end

        local tenant_ok = true

        if artifacts.locationsConf then
            local lf = io.open(dir .. "/locations.conf", "w")
            if lf then
                lf:write(localize_locations_conf(artifacts.locationsConf, slug))
                lf:close()
            else
                ngx.log(ngx.ERR, "Failed to write locations.conf for tenant: ", slug)
                tenant_ok = false
            end
        end

        if tenant_ok and artifacts.luaFiles then
            for filename, content in pairs(artifacts.luaFiles) do
                if is_safe_lua_filename(filename) then
                    local lf = io.open(dir .. "/" .. filename, "w")
                    if lf then
                        lf:write(content)
                        lf:close()
                    else
                        ngx.log(ngx.ERR, "Failed to write lua file ", filename, " for tenant: ", slug)
                        tenant_ok = false
                    end
                else
                    ngx.log(ngx.ERR, "Invalid lua filename, skipping: ", filename)
                    tenant_ok = false
                end
            end
        end

        if not tenant_ok then
            ngx.log(ngx.ERR, "Cleaning up gateway artifacts for tenant ", slug, " due to write failure")
            remove_tree(dir)
            failed_slugs[#failed_slugs + 1] = slug
        end

        ::continue_gateway::
    end
end

if #failed_slugs > 0 then
    return json_response(500, {
        success = false,
        error = "Failed to write gateway artifacts",
        failed_slugs = failed_slugs,
    })
end

if config.sidecar then
    normalize_sidecar_rules(config.sidecar)
    local sf = io.open(sidecar_config_path, "w")
    if not sf then
        return json_response(500, {error = "Failed to write sidecar config"})
    end

    sf:write(cjson.encode(config.sidecar))
    sf:close()
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
    return json_response(500, {
        error = "Failed to regenerate nginx config",
    })
end

local live_config_file = io.open(live_config_path, "w")
if not live_config_file then
    return json_response(500, {error = "Failed to write tenant-config.json"})
end

live_config_file:write(body)
live_config_file:close()

ngx.shared.tenants:flush_all()
for key, value in pairs(tenant_entries) do
    ngx.shared.tenants:set(key, value)
end

ngx.header["Content-Type"] = "application/json"
ngx.say(cjson.encode({
    success = true,
    tenant_count = count,
}))
