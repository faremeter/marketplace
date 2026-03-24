local httpc = require("resty.http").new()
local cjson = require("cjson")

local FACILITATOR_URL = "https://facilitator.corbits.dev"
local BASE_DOMAIN = "api.corbits.dev"
local ALT_BASE_DOMAIN = "api.corbits.io"

local function canonicalize_tenant_domain(host)
    if not host then
        return nil
    end

    host = string.lower(host)
    local escaped_base = BASE_DOMAIN:gsub("%.", "%%.")
    local escaped_alt = ALT_BASE_DOMAIN:gsub("%.", "%%.")
    local patterns = {
        "^(.+)%." .. escaped_base .. "$",
        "^(.+)%." .. escaped_alt .. "$"
    }

    for _, pattern in ipairs(patterns) do
        local prefix = string.match(host, pattern)
        if prefix then
            return prefix .. "." .. BASE_DOMAIN
        end
    end

    return nil
end

local function get_control_plane_addrs()
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
        if trimmed and trimmed ~= "" then
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

local function request_control_plane(path, opts)
    local http = require("resty.http").new()
    local addrs = get_control_plane_addrs()
    local n = #addrs

    local idx = (ngx.shared.tenants:get("_control_plane_idx") or 0) % n + 1
    ngx.shared.tenants:set("_control_plane_idx", idx)

    for attempt = 1, n do
        local addr = addrs[((idx - 1 + attempt - 1) % n) + 1]
        local url = "http://" .. addr .. path
        local res, err = http:request_uri(url, opts)
        if res then return res, nil end
        ngx.log(ngx.WARN, "Control plane ", addr, " failed: ", err, " (attempt ", attempt, "/", n, ")")
    end
    return nil, "all control planes unreachable"
end

ngx.req.read_body()
local req_body = ngx.req.get_body_data()
local req_headers = ngx.req.get_headers()

local client_ip = ngx.var.remote_addr
local request_method = ngx.req.get_method()
local request_host = ngx.var.host
local query_string = ngx.var.args
local user_agent = req_headers["User-Agent"] or req_headers["user-agent"]
local x_forwarded_for = req_headers["X-Forwarded-For"] or req_headers["x-forwarded-for"]

local tenant_domain = canonicalize_tenant_domain(ngx.var.host)
if not tenant_domain then
    ngx.status = 400
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({error = "Invalid hostname format"}))
    return ngx.exit(400)
end

local tenant_json = ngx.shared.tenants:get(tenant_domain)
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

if not tenant_config.backend_url or tenant_config.backend_url == cjson.null then
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({error = "Tenant missing backend_url"}))
    return ngx.exit(500)
end

local tenant_domain_cfg = tenant_config.domain
if tenant_domain_cfg == cjson.null then tenant_domain_cfg = nil end
tenant_config.domain = tenant_domain_cfg or tenant_domain

local proxy_name_cfg = tenant_config.proxy_name
if proxy_name_cfg == cjson.null then proxy_name_cfg = nil end
local name_cfg = tenant_config.name
if name_cfg == cjson.null then name_cfg = nil end
local proxy_name = proxy_name_cfg or name_cfg or tenant_domain
local tenant_org_slug = tenant_config.org_slug
if tenant_org_slug == cjson.null then tenant_org_slug = nil end

local backend_url = tenant_config.backend_url:match("^%s*(.-)%s*$"):gsub("/$", "")
local base_url, backend_query = string.match(backend_url, "^([^?]+)%??(.*)")
if backend_query and backend_query ~= "" then
    local args = ngx.var.args
    ngx.var.args = args and (backend_query .. "&" .. args) or backend_query
end

local effective_url = base_url or backend_url
local origin = string.match(effective_url, "(https?://[^/]+)")
local backend_path = string.match(effective_url, "https?://[^/]+(/.+)") or ""
local client_uri = ngx.var.uri
if client_uri == "/" and backend_path ~= "" then
    ngx.var.backend_url = origin .. backend_path
else
    ngx.var.backend_url = origin .. backend_path .. client_uri
end

local backend_host = origin and string.match(origin, "https?://(.+)")
if backend_host then
    ngx.var.backend_host = backend_host
end

if tenant_config.upstream_auth_header and tenant_config.upstream_auth_header ~= cjson.null then
    local auth_value = tenant_config.upstream_auth_value
    if auth_value == cjson.null then auth_value = nil end
    ngx.req.set_header(tenant_config.upstream_auth_header, auth_value)
end

local default_price = tenant_config.default_price_usdc
if default_price == cjson.null then default_price = nil end
local price = default_price or 0

local default_scheme = tenant_config.default_scheme
if default_scheme == cjson.null then default_scheme = nil end
local scheme = default_scheme or "exact"
local matched_endpoint_id = nil
if tenant_config.endpoints then
    for _, endpoint in ipairs(tenant_config.endpoints) do
        local pattern = endpoint.path_pattern
        if not pattern or pattern == cjson.null then
            goto continue
        end
        local matched = false

        if string.sub(pattern, 1, 1) == "^" then
            local ok, regex = pcall(ngx.re.match, ngx.var.uri, pattern)
            if ok and regex then
                matched = true
            end
        else
            if string.sub(ngx.var.uri, 1, #pattern) == pattern then
                matched = true
            end
        end

        if matched then
            matched_endpoint_id = endpoint.id
            if endpoint.price_usdc and endpoint.price_usdc ~= cjson.null then
                price = endpoint.price_usdc
            end
            if endpoint.scheme and endpoint.scheme ~= cjson.null then
                scheme = endpoint.scheme
            end
            break
        end
        ::continue::
    end
end

-- Free endpoints bypass payment regardless of whether the tenant has token_prices configured.
-- The resolved scheme/price already accounts for endpoint-level overrides (see endpoint matching above).
if scheme == "free" or price == 0 then
    ngx.log(ngx.INFO, "Free endpoint: ", proxy_name, " ", ngx.var.uri)
    local free_ngx_request_id = ngx.var.request_id
    local free_request_path = ngx.var.uri
    local free_tenant_name = proxy_name
    local free_org_slug = tenant_org_slug
    local free_endpoint_id = matched_endpoint_id
    local free_client_ip = client_ip
    local free_request_method = request_method
    local free_metadata = {
        host = request_host,
        query_string = query_string or cjson.null,
        user_agent = user_agent or cjson.null,
        x_forwarded_for = x_forwarded_for or cjson.null
    }
    ngx.timer.at(0, function(premature)
        if premature then return end
        local free_body = cjson.encode({
            ngx_request_id = free_ngx_request_id,
            tx_hash = cjson.null,
            tenant_name = free_tenant_name,
            org_slug = free_org_slug or cjson.null,
            endpoint_id = free_endpoint_id or cjson.null,
            amount_usdc = 0,
            network = cjson.null,
            request_path = free_request_path,
            client_ip = free_client_ip,
            request_method = free_request_method,
            metadata = free_metadata
        })
        local free_res, free_err = request_control_plane("/internal/transactions", {
            method = "POST",
            headers = { ["Content-Type"] = "application/json" },
            body = free_body,
            timeout = 5000
        })
        if not free_res then
            ngx.log(ngx.ERR, "Failed to record free transaction: ", free_err)
        elseif free_res.status ~= 200 then
            ngx.log(ngx.WARN, "Free transaction recording returned status: ", free_res.status)
        end
    end)
    return
end

price = tostring(price)

local wallet = tenant_config.wallet_config
if type(wallet) ~= "table" then
    wallet = {}
end

local accepts_body = {
    x402Version = 1,
    accepts = {}
}

local resource = "https://" .. ngx.var.host .. ngx.var.uri
local description = "API - " .. ngx.var.uri

-- Build accepts from token_prices if available (per-token pricing)
local token_prices = tenant_config.token_prices
local has_token_prices = token_prices and #token_prices > 0

-- Resolve effective token prices for matched endpoint
local effective_token_prices = {}
if has_token_prices then
    -- Collect tenant-level defaults (endpoint_id is null/0)
    for _, tp in ipairs(token_prices) do
        if not tp.endpoint_id or tp.endpoint_id == 0 or tp.endpoint_id == cjson.null then
            local key = tp.network .. ":" .. tp.token_symbol
            effective_token_prices[key] = tp
        end
    end
    -- Override with endpoint-level prices if we matched an endpoint
    if matched_endpoint_id then
        for _, tp in ipairs(token_prices) do
            if tp.endpoint_id == matched_endpoint_id then
                local key = tp.network .. ":" .. tp.token_symbol
                effective_token_prices[key] = tp
            end
        end
    end
end

if has_token_prices and next(effective_token_prices) then
    -- Solana tokens from token_prices
    local solana_address = nil
    if wallet.solana and wallet.solana["mainnet-beta"] and wallet.solana["mainnet-beta"].address and wallet.solana["mainnet-beta"].address ~= "" and wallet.solana["mainnet-beta"].address ~= cjson.null then
        solana_address = wallet.solana["mainnet-beta"].address
    end

    -- NOTE: Adding a new EVM chain to token_prices requires a corresponding entry here
    local evm_addresses = {}
    if wallet.evm then
        if wallet.evm.base and wallet.evm.base.address and wallet.evm.base.address ~= "" and wallet.evm.base.address ~= cjson.null then
            evm_addresses["base"] = wallet.evm.base.address
        end
        if wallet.evm.polygon and wallet.evm.polygon.address and wallet.evm.polygon.address ~= "" and wallet.evm.polygon.address ~= cjson.null then
            evm_addresses["polygon"] = wallet.evm.polygon.address
            evm_addresses["eip155:137"] = wallet.evm.polygon.address
        end
        if wallet.evm.monad and wallet.evm.monad.address and wallet.evm.monad.address ~= "" and wallet.evm.monad.address ~= cjson.null then
            evm_addresses["eip155:143"] = wallet.evm.monad.address
        end
    end

    for _, tp in pairs(effective_token_prices) do
        local pay_to = nil
        local timeout = 60

        -- Handle both network names: DB seeds "solana-mainnet-beta" but legacy clients may use "solana"
        if tp.network == "solana-mainnet-beta" or tp.network == "solana" then
            pay_to = solana_address
        else
            pay_to = evm_addresses[tp.network]
            timeout = 300
        end

        if pay_to and tonumber(tp.amount) > 0 then
            table.insert(accepts_body.accepts, {
                network = tp.network,
                scheme = scheme,
                asset = tp.mint_address,
                payTo = pay_to,
                maxAmountRequired = tostring(tp.amount),
                resource = resource,
                description = description,
                mimeType = "application/json",
                maxTimeoutSeconds = timeout,
                token_symbol = tp.token_symbol
            })
            -- Emit "solana" alias so legacy clients using network="solana" still match
            if tp.network == "solana-mainnet-beta" then
                table.insert(accepts_body.accepts, {
                    network = "solana",
                    scheme = scheme,
                    asset = tp.mint_address,
                    payTo = pay_to,
                    maxAmountRequired = tostring(tp.amount),
                    resource = resource,
                    description = description,
                    mimeType = "application/json",
                    maxTimeoutSeconds = timeout,
                    token_symbol = tp.token_symbol
                })
            end
        end
    end
else
    if has_token_prices then
        ngx.log(ngx.WARN, "token_prices configured but none match endpoint: ", proxy_name, " ", ngx.var.uri, " (falling back to legacy USDC)")
    end
    -- Fallback: legacy hardcoded USDC behavior when no token_prices configured or none match
    if wallet.solana and wallet.solana["mainnet-beta"] and wallet.solana["mainnet-beta"].address and wallet.solana["mainnet-beta"].address ~= "" and wallet.solana["mainnet-beta"].address ~= cjson.null then
        table.insert(accepts_body.accepts, {
            network = "solana-mainnet-beta",
            scheme = scheme,
            asset = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            payTo = wallet.solana["mainnet-beta"].address,
            maxAmountRequired = price,
            resource = resource,
            description = description,
            mimeType = "application/json",
            maxTimeoutSeconds = 60,
            token_symbol = "USDC"
        })
        table.insert(accepts_body.accepts, {
            network = "solana",
            scheme = scheme,
            asset = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            payTo = wallet.solana["mainnet-beta"].address,
            maxAmountRequired = price,
            resource = resource,
            description = description,
            mimeType = "application/json",
            maxTimeoutSeconds = 60,
            token_symbol = "USDC"
        })
    end

    if wallet.evm and wallet.evm.base and wallet.evm.base.address and wallet.evm.base.address ~= "" and wallet.evm.base.address ~= cjson.null then
        table.insert(accepts_body.accepts, {
            scheme = scheme,
            network = "base",
            payTo = wallet.evm.base.address,
            asset = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            maxAmountRequired = price,
            resource = resource,
            description = description,
            mimeType = "application/json",
            maxTimeoutSeconds = 300,
            token_symbol = "USDC"
        })
    end

    if wallet.evm and wallet.evm.polygon and wallet.evm.polygon.address and wallet.evm.polygon.address ~= "" and wallet.evm.polygon.address ~= cjson.null then
        table.insert(accepts_body.accepts, {
            scheme = scheme,
            network = "polygon",
            payTo = wallet.evm.polygon.address,
            asset = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
            maxAmountRequired = price,
            resource = resource,
            description = description,
            mimeType = "application/json",
            maxTimeoutSeconds = 300,
            token_symbol = "USDC"
        })
        table.insert(accepts_body.accepts, {
            scheme = scheme,
            network = "eip155:137",
            payTo = wallet.evm.polygon.address,
            asset = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
            maxAmountRequired = price,
            resource = resource,
            description = description,
            mimeType = "application/json",
            maxTimeoutSeconds = 300,
            token_symbol = "USDC"
        })
    end

    if wallet.evm and wallet.evm.monad and wallet.evm.monad.address and wallet.evm.monad.address ~= "" and wallet.evm.monad.address ~= cjson.null then
        table.insert(accepts_body.accepts, {
            scheme = scheme,
            network = "eip155:143",
            payTo = wallet.evm.monad.address,
            asset = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
            maxAmountRequired = price,
            resource = resource,
            description = description,
            mimeType = "application/json",
            maxTimeoutSeconds = 300,
            token_symbol = "USDC"
        })
    end
end

local res, err = httpc:request_uri(FACILITATOR_URL .. "/accepts", {
    method = "POST",
    headers = {
        ["Content-Type"] = "application/json",
        ["Accept"] = "application/json"
    },
    body = cjson.encode(accepts_body),
    timeout = 10000
})

if not res then
    ngx.log(ngx.ERR, "Failed to get payment requirements: ", err)
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({error = "Failed to get payment requirements"}))
    return ngx.exit(500)
end

if res.status ~= 200 then
    ngx.log(ngx.ERR, "Facilitator returned status: ", res.status)
    ngx.status = res.status
    ngx.say(res.body)
    return ngx.exit(res.status)
end

local payment_header = req_headers["X-PAYMENT"] or req_headers["x-payment"]

if not payment_header then
    ngx.status = 402
    ngx.header["Content-Type"] = "application/json"
    ngx.say(res.body)
    return ngx.exit(402)
end

local decoded_header = ngx.decode_base64(payment_header)
if not decoded_header then
    ngx.status = 402
    ngx.header["Content-Type"] = "application/json"
    ngx.say(res.body)
    return ngx.exit(402)
end

local ok, payment_json = pcall(cjson.decode, decoded_header)
if not ok then
    ngx.status = 402
    ngx.header["Content-Type"] = "application/json"
    ngx.say(res.body)
    return ngx.exit(402)
end

if not payment_json.network or not payment_json.scheme then
    ngx.status = 402
    ngx.header["Content-Type"] = "application/json"
    ngx.say(res.body)
    return ngx.exit(402)
end

local ok, payment_requirements = pcall(cjson.decode, res.body)
if not ok then
    ngx.log(ngx.ERR, "Failed to decode payment requirements: ", payment_requirements)
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({error = "Failed to decode payment requirements"}))
    return ngx.exit(500)
end

local matching_req = nil
for _, req in ipairs(payment_requirements.accepts) do
    local network_match = req.network == payment_json.network
    local scheme_match = req.scheme == payment_json.scheme
    local asset_match = not payment_json.asset or string.lower(req.asset) == string.lower(payment_json.asset)
    if network_match and scheme_match and asset_match then
        matching_req = req
        break
    end
end

-- Look up token_symbol from our local accepts (facilitator may not preserve custom fields)
local resolved_token_symbol = nil
if matching_req then
    for _, acc in ipairs(accepts_body.accepts) do
        if acc.network == matching_req.network and string.lower(acc.asset) == string.lower(matching_req.asset) then
            resolved_token_symbol = acc.token_symbol
            break
        end
    end
end

if not matching_req then
    ngx.status = 402
    ngx.header["Content-Type"] = "application/json"
    ngx.say(res.body)
    return ngx.exit(402)
end

local settle_body = {
    x402Version = 1,
    paymentHeader = payment_header,
    paymentRequirements = matching_req
}

local settle_res, settle_err = httpc:request_uri(FACILITATOR_URL .. "/settle", {
    method = "POST",
    headers = {
        ["Content-Type"] = "application/json",
        ["Accept"] = "application/json"
    },
    body = cjson.encode(settle_body),
    timeout = 30000
})

if not settle_res then
    ngx.log(ngx.ERR, "Failed to settle payment: ", settle_err)
    ngx.status = 402
    ngx.header["Content-Type"] = "application/json"
    ngx.say(res.body)
    return ngx.exit(402)
end

local ok, settle_response = pcall(cjson.decode, settle_res.body)
if not ok then
    ngx.log(ngx.ERR, "Failed to decode settle response: ", settle_response)
    ngx.status = 402
    ngx.header["Content-Type"] = "application/json"
    ngx.say(res.body)
    return ngx.exit(402)
end

if settle_res.status ~= 200 or not settle_response.success then
    ngx.log(ngx.WARN, "Settlement failed: ", settle_res.body)
    ngx.status = 402
    ngx.header["Content-Type"] = "application/json"
    ngx.say(res.body)
    return ngx.exit(402)
end

ngx.log(ngx.INFO, "Payment settled successfully: ", settle_response.transaction or "unknown")
ngx.log(ngx.INFO, "Tenant: ", proxy_name, " Request: ", ngx.req.get_method(), " ", ngx.var.uri)

local tx_hash = settle_response.transaction or settle_response.txHash
if tx_hash then
    local tx_ngx_request_id = ngx.var.request_id
    local tx_network = matching_req.network
    local tx_amount = tonumber(matching_req.maxAmountRequired) or tonumber(price) or 0
    local tx_request_path = ngx.var.uri
    local tx_tenant_name = proxy_name
    local tx_org_slug = tenant_org_slug
    local tx_endpoint_id = matched_endpoint_id
    local tx_client_ip = client_ip
    local tx_request_method = request_method
    local tx_metadata = {
        host = request_host,
        query_string = query_string or cjson.null,
        user_agent = user_agent or cjson.null,
        x_forwarded_for = x_forwarded_for or cjson.null,
        payment = {
            pay_to = matching_req.payTo,
            asset = matching_req.asset,
            token_symbol = resolved_token_symbol or cjson.null,
            scheme = matching_req.scheme,
            payload = payment_json.payload or cjson.null
        }
    }
    ngx.timer.at(0, function(premature)
        if premature then return end
        local tx_body = cjson.encode({
            ngx_request_id = tx_ngx_request_id,
            tx_hash = tx_hash,
            tenant_name = tx_tenant_name,
            org_slug = tx_org_slug or cjson.null,
            endpoint_id = tx_endpoint_id or cjson.null,
            amount_usdc = tx_amount,
            network = tx_network,
            request_path = tx_request_path,
            client_ip = tx_client_ip,
            request_method = tx_request_method,
            metadata = tx_metadata
        })
        local tx_res, tx_err = request_control_plane("/internal/transactions", {
            method = "POST",
            headers = { ["Content-Type"] = "application/json" },
            body = tx_body,
            timeout = 5000
        })
        if not tx_res then
            ngx.log(ngx.ERR, "Failed to record transaction: ", tx_err)
        elseif tx_res.status ~= 200 then
            ngx.log(ngx.WARN, "Transaction recording returned status: ", tx_res.status)
        end
    end)
end
