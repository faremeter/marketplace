local M = {}

function M.get_addrs()
    local cached = ngx.shared.tenants:get("_control_plane_addrs")
    if cached then
        local addrs = {}
        for addr in cached:gmatch("[^,]+") do
            table.insert(addrs, addr)
        end
        return addrs
    end

    local f = io.open("/etc/nginx/control-plane-addrs.conf", "r")
    if not f then
        ngx.log(ngx.ERR, "control-plane-addrs.conf not found")
        return {}
    end
    local content = f:read("*a")
    f:close()

    local addrs = {}
    local clean = {}
    for addr in content:gmatch("[^,\n]+") do
        local trimmed = addr:match("^%s*(.-)%s*$")
        if trimmed and trimmed ~= "" and trimmed:sub(1, 1) ~= "#" then
            table.insert(addrs, trimmed)
            table.insert(clean, trimmed)
        end
    end

    if #addrs == 0 then
        ngx.log(ngx.ERR, "control-plane-addrs.conf is empty")
        return {}
    end

    ngx.shared.tenants:set("_control_plane_addrs", table.concat(clean, ","), 60)
    return addrs
end

function M.request(path, opts)
    local http = require("resty.http").new()
    local addrs = M.get_addrs()
    local n = #addrs

    if n == 0 then
        return nil, "no control plane addresses available"
    end

    local val, err = ngx.shared.tenants:incr("_control_plane_idx", 1, 0)
    if not val then
        ngx.log(ngx.ERR, "Failed to increment control plane index: ", err)
        val = 1
    end
    local idx = (val - 1) % n + 1

    for attempt = 1, n do
        local addr = addrs[((idx - 1 + attempt - 1) % n) + 1]
        local url = "http://" .. addr .. path
        local res, err = http:request_uri(url, opts)
        if res then return res, nil end
        ngx.log(ngx.WARN, "Control plane ", addr, " failed: ", err, " (attempt ", attempt, "/", n, ")")
    end
    return nil, "all control planes unreachable"
end

return M
