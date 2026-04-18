local cjson = require("cjson")

local M = {}

function M.resolve_backend(backend_url)
    backend_url = backend_url:match("^%s*(.-)%s*$"):gsub("/$", "")
    local base_url, backend_query = string.match(backend_url, "^([^?]+)%??(.*)")
    if backend_query and backend_query ~= "" then
        local args = ngx.var.args
        ngx.var.args = args and (backend_query .. "&" .. args) or backend_query
    end
    backend_url = base_url or backend_url

    -- proxy_pass uses variable interpolation so nginx does not append $uri
    -- automatically; we must include the client request path ourselves.
    -- Skip appending "/" to avoid a trailing-slash mismatch when the backend
    -- URL already has a path component (e.g. https://api.example.com/v1).
    local client_uri = ngx.var.uri
    if client_uri == "/" then
        ngx.var.backend_url = backend_url
    else
        ngx.var.backend_url = backend_url .. client_uri
    end
    local backend_host = backend_url:match("https?://([^/]+)")
    if backend_host then
        ngx.var.backend_host = backend_host
    end
end

local safe_header_name = "^[a-zA-Z0-9_%-]+$"
local unsafe_value_chars = '["\n\r;$\\\\]'

-- Inject upstream auth header if the tenant has one configured.
-- Validates against the same rules as sync.ts to prevent header injection.
function M.inject_auth(tenant_config)
    local auth_header = tenant_config.upstream_auth_header
    local auth_value = tenant_config.upstream_auth_value
    if auth_header and auth_header ~= "" and auth_header ~= cjson.null
        and auth_value and auth_value ~= "" and auth_value ~= cjson.null then
        if not auth_header:match(safe_header_name) then
            ngx.log(ngx.ERR, "inject_auth: invalid header name for host ", ngx.var.host)
            return
        end
        if auth_value:match(unsafe_value_chars) then
            ngx.log(ngx.ERR, "inject_auth: unsafe characters in auth value for host ", ngx.var.host)
            return
        end
        ngx.req.set_header(auth_header, auth_value)
    end
end

return M
