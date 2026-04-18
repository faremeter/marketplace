local cjson = require("cjson")
local cp = require("control-plane-client")
local tenant_request = require("tenant-request")

local tenant_json = ngx.shared.tenants:get(ngx.var.host)
if not tenant_json then
    ngx.status = 404
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({error = "Tenant not found"}))
    return ngx.exit(404)
end

local ok, tenant_config = pcall(cjson.decode, tenant_json)
if not ok then
    ngx.log(ngx.ERR, "Failed to parse tenant config: ", tenant_config)
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({error = "Failed to parse tenant config"}))
    return ngx.exit(500)
end

local backend_url = tenant_config.backend_url
if not backend_url or backend_url == cjson.null or backend_url == "" then
    ngx.log(ngx.ERR, "No backend_url configured for host: ", ngx.var.host)
    return ngx.exit(502)
end

tenant_request.resolve_backend(backend_url)
tenant_request.inject_auth(tenant_config)

local proxy_name_cfg = tenant_config.proxy_name
if proxy_name_cfg == cjson.null then proxy_name_cfg = nil end
local name_cfg = tenant_config.name
if name_cfg == cjson.null then name_cfg = nil end
local tenant_name = proxy_name_cfg or name_cfg or ngx.var.host

local org_slug = tenant_config.org_slug
if org_slug == cjson.null then org_slug = nil end

local req_headers = ngx.req.get_headers()
local request_host = ngx.var.host
local query_string = ngx.var.args
local user_agent = req_headers["User-Agent"] or req_headers["user-agent"]
local x_forwarded_for = req_headers["X-Forwarded-For"] or req_headers["x-forwarded-for"]

local ngx_request_id = ngx.var.request_id
local request_path = ngx.var.uri
local client_ip = ngx.var.remote_addr
local request_method = ngx.req.get_method()
local metadata = {
    host = request_host,
    query_string = query_string or cjson.null,
    user_agent = user_agent or cjson.null,
    x_forwarded_for = x_forwarded_for or cjson.null
}

ngx.timer.at(0, function(premature)
    if premature then return end
    local body = cjson.encode({
        ngx_request_id = ngx_request_id,
        tx_hash = cjson.null,
        tenant_name = tenant_name,
        org_slug = org_slug or cjson.null,
        -- Catch-all path has no endpoint context; paid endpoints are routed
        -- through gateway locations which handle their own attribution.
        endpoint_id = cjson.null,
        amount = 0,
        network = cjson.null,
        token_symbol = cjson.null,
        mint_address = cjson.null,
        request_path = request_path,
        client_ip = client_ip,
        request_method = request_method,
        metadata = metadata
    })
    local res, err = cp.request("/internal/transactions", {
        method = "POST",
        headers = { ["Content-Type"] = "application/json" },
        body = body,
        timeout = 5000
    })
    if not res then
        ngx.log(ngx.ERR, "Failed to record free transaction: ", err)
    elseif res.status ~= 200 then
        ngx.log(ngx.WARN, "Free transaction recording returned status: ", res.status)
    end
end)
