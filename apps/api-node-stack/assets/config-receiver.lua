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

-- Read domain config for alt-domain population
local domain_config_file = io.open("/etc/nginx/domain-config.json", "r")
local base_domain = nil
local alt_domains = {}
if domain_config_file then
    local dc_ok, dc = pcall(cjson.decode, domain_config_file:read("*all"))
    domain_config_file:close()
    if dc_ok and dc then
        base_domain = dc.base_domain
        alt_domains = (type(dc.alt_domains) == "table") and dc.alt_domains or {}
    else
        ngx.log(ngx.ERR, "Failed to parse domain-config.json, alt-domain population will be skipped")
    end
else
    ngx.log(ngx.ERR, "Failed to read domain-config.json, alt-domain population will be skipped")
end

local tenant_entries = {}
local count = 0
for domain, tenant_config in pairs(config.config) do
    local key = tenant_config.domain or domain
    if key then
        local encoded = cjson.encode(tenant_config)
        tenant_entries[key] = encoded
        count = count + 1
        -- Populate alt-domain entries so lookups by alt host succeed
        if base_domain then
            local escaped_base = base_domain:gsub("%.", "%%.")
            for _, alt in ipairs(alt_domains) do
                local alt_key = key:gsub("%." .. escaped_base .. "$", "." .. alt)
                if alt_key ~= key then
                    tenant_entries[alt_key] = encoded
                end
            end
        end
    end
end

-- Write durable config to disk before updating in-memory state so that a
-- file-write failure (full disk, permissions) leaves the running config
-- unchanged rather than advancing memory while disk stays stale.
local config_file = io.open("/etc/nginx/tenant-config.json", "w")
local config_written = false
if config_file then
    config_file:write(body)
    config_file:close()
    config_written = true
else
    ngx.log(ngx.ERR, "Failed to write tenant-config.json — skipping all config updates")
end

local failed_slugs = {}

if not config_written then
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({
        success = false,
        error = "Failed to write tenant-config.json",
        tenant_count = 0,
    }))
    return ngx.exit(500)
end

ngx.shared.tenants:flush_all()
for key, value in pairs(tenant_entries) do
    ngx.shared.tenants:set(key, value)
end

if config.gateway then
    for slug, artifacts in pairs(config.gateway) do
        if not slug:match("^[a-z0-9%-]+$") then
            ngx.log(ngx.ERR, "Invalid gateway slug, skipping: ", slug)
            failed_slugs[#failed_slugs + 1] = slug
            goto continue_gateway
        end

        local dir = "/etc/faremeter-gateway/" .. slug
        local mkdir_result = os.execute("mkdir -p " .. dir)
        if mkdir_result ~= 0 then
            ngx.log(ngx.ERR, "Failed to create gateway directory: ", dir)
            failed_slugs[#failed_slugs + 1] = slug
            goto continue_gateway
        end

        local tenant_ok = true

        if artifacts.locationsConf then
            local lf = io.open(dir .. "/locations.conf", "w")
            if lf then
                lf:write(artifacts.locationsConf)
                lf:close()
            else
                ngx.log(ngx.ERR, "Failed to write locations.conf for tenant: ", slug)
                tenant_ok = false
            end
        end

        if tenant_ok and artifacts.luaFiles then
            for filename, content in pairs(artifacts.luaFiles) do
                if filename:find("/") or filename:find("%.%.") or filename == "locations.conf" then
                    ngx.log(ngx.ERR, "Invalid lua filename, skipping: ", filename)
                    tenant_ok = false
                else
                    local lf = io.open(dir .. "/" .. filename, "w")
                    if lf then
                        lf:write(content)
                        lf:close()
                    else
                        ngx.log(ngx.ERR, "Failed to write lua file ", filename, " for tenant: ", slug)
                        tenant_ok = false
                    end
                end
            end
        end

        if not tenant_ok then
            ngx.log(ngx.ERR, "Cleaning up gateway artifacts for tenant ", slug, " due to write failure")
            os.execute("rm -rf " .. dir)
            failed_slugs[#failed_slugs + 1] = slug
        end

        ::continue_gateway::
    end
end

-- Reload sidecar before nginx so the sidecar is ready when nginx starts routing
if config.sidecar then
    local sf = io.open("/etc/faremeter-sidecar/config.json", "w")
    if sf then
        sf:write(cjson.encode(config.sidecar))
        sf:close()
        local reload_result = os.execute("sudo /usr/local/bin/reload-faremeter-sidecar")
        if reload_result ~= 0 then
            ngx.log(ngx.ERR, "reload-faremeter-sidecar failed with exit code: ", reload_result)
        end
    else
        ngx.log(ngx.ERR, "Failed to write /etc/faremeter-sidecar/config.json")
    end
end

-- Regenerate nginx after sidecar is ready and gateway artifacts are on disk
local regen_result = os.execute("sudo -u tenantmgr /usr/local/bin/regen-tenant-nginx")
if regen_result ~= 0 then
    ngx.log(ngx.ERR, "regen-tenant-nginx failed with exit code: ", regen_result)
end

local success = #failed_slugs == 0

ngx.header["Content-Type"] = "application/json"
ngx.say(cjson.encode({
    success = success,
    tenant_count = count,
    failed_slugs = #failed_slugs > 0 and failed_slugs or nil,
}))
