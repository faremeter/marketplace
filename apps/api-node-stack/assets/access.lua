local httpc = require("resty.http").new()
local cjson = require("cjson")

local FACILITATOR_URL = "https://facilitator.corbits.dev"

ngx.req.read_body()
local req_body = ngx.req.get_body_data()
local req_headers = ngx.req.get_headers()

local tenant_name = string.match(ngx.var.host, "^([^.]+)%.test%.api%.corbits%.") or
                    string.match(ngx.var.host, "^([^.]+)%.api%.corbits%.")
if not tenant_name then
    ngx.status = 400
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({error = "Invalid hostname format"}))
    return ngx.exit(400)
end

local tenant_json = ngx.shared.tenants:get(tenant_name)
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

-- Parse backend URL and merge query strings
local backend_url = tenant_config.backend_url:gsub("/$", "")
local base_url, backend_query = string.match(backend_url, "^([^?]+)%??(.*)")
ngx.var.backend_url = base_url or backend_url
if backend_query and backend_query ~= "" then
    local args = ngx.var.args
    ngx.var.args = args and (backend_query .. "&" .. args) or backend_query
end

local backend_host = string.match(base_url or backend_url, "https?://([^/]+)")
if backend_host then
    ngx.var.backend_host = backend_host
end

if tenant_config.upstream_auth_header then
    ngx.req.set_header(tenant_config.upstream_auth_header, tenant_config.upstream_auth_value)
end

local price = tenant_config.default_price_usdc
local scheme = tenant_config.default_scheme
local matched_endpoint_id = nil
if tenant_config.endpoints then
    for _, endpoint in ipairs(tenant_config.endpoints) do
        local pattern = endpoint.path_pattern
        local matched = false

        if string.sub(pattern, 1, 1) == "^" then
            -- Regex match (pattern starts with ^)
            local ok, regex = pcall(ngx.re.match, ngx.var.uri, pattern)
            if ok and regex then
                matched = true
            end
        else
            -- Prefix match (literal path)
            if string.sub(ngx.var.uri, 1, #pattern) == pattern then
                matched = true
            end
        end

        if matched then
            matched_endpoint_id = endpoint.id
            if endpoint.price_usdc then
                price = endpoint.price_usdc
            end
            if endpoint.scheme then
                scheme = endpoint.scheme
            end
            break
        end
    end
end

if scheme == "free" or price == 0 then
    ngx.log(ngx.INFO, "Free endpoint: ", tenant_name, " ", ngx.var.uri)
    return
end

price = tostring(price)

local wallet = tenant_config.wallet_config

local accepts_body = {
    x402Version = 1,
    accepts = {}
}

-- Add Solana mainnet
if wallet.solana and wallet.solana["mainnet-beta"] and wallet.solana["mainnet-beta"].address and wallet.solana["mainnet-beta"].address ~= "" then
    table.insert(accepts_body.accepts, {
        network = "solana-mainnet-beta",
        scheme = scheme,
        asset = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        payTo = wallet.solana["mainnet-beta"].address,
        maxAmountRequired = price,
        resource = "https://" .. ngx.var.host .. ngx.var.uri,
        description = "API - " .. ngx.var.uri,
        mimeType = "application/json",
        maxTimeoutSeconds = 60
    })
    table.insert(accepts_body.accepts, {
        network = "solana",
        scheme = scheme,
        asset = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        payTo = wallet.solana["mainnet-beta"].address,
        maxAmountRequired = price,
        resource = "https://" .. ngx.var.host .. ngx.var.uri,
        description = "API - " .. ngx.var.uri,
        mimeType = "application/json",
        maxTimeoutSeconds = 60
    })
end

-- Add Base
if wallet.evm and wallet.evm.base and wallet.evm.base.address and wallet.evm.base.address ~= "" then
    table.insert(accepts_body.accepts, {
        scheme = scheme,
        network = "base",
        payTo = wallet.evm.base.address,
        asset = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        maxAmountRequired = price,
        resource = "https://" .. ngx.var.host .. ngx.var.uri,
        description = "API - " .. ngx.var.uri,
        mimeType = "application/json",
        maxTimeoutSeconds = 300
    })
end

-- Add Polygon
if wallet.evm and wallet.evm.polygon and wallet.evm.polygon.address and wallet.evm.polygon.address ~= "" then
    table.insert(accepts_body.accepts, {
        scheme = scheme,
        network = "polygon",
        payTo = wallet.evm.polygon.address,
        asset = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        maxAmountRequired = price,
        resource = "https://" .. ngx.var.host .. ngx.var.uri,
        description = "API - " .. ngx.var.uri,
        mimeType = "application/json",
        maxTimeoutSeconds = 300
    })
    table.insert(accepts_body.accepts, {
        scheme = scheme,
        network = "eip155:137",
        payTo = wallet.evm.polygon.address,
        asset = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        maxAmountRequired = price,
        resource = "https://" .. ngx.var.host .. ngx.var.uri,
        description = "API - " .. ngx.var.uri,
        mimeType = "application/json",
        maxTimeoutSeconds = 300
    })
end

-- Add Monad
if wallet.evm and wallet.evm.monad and wallet.evm.monad.address and wallet.evm.monad.address ~= "" then
    table.insert(accepts_body.accepts, {
        scheme = scheme,
        network = "eip155:143",
        payTo = wallet.evm.monad.address,
        asset = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
        maxAmountRequired = price,
        resource = "https://" .. ngx.var.host .. ngx.var.uri,
        description = "API - " .. ngx.var.uri,
        mimeType = "application/json",
        maxTimeoutSeconds = 300
    })
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
    if req.network == payment_json.network and req.scheme == payment_json.scheme then
        matching_req = req
        break
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

ngx.log(ngx.INFO, "Payment settled successfully: ", settle_response.txHash or "unknown")
ngx.log(ngx.INFO, "Tenant: ", tenant_name, " Request: ", ngx.req.get_method(), " ", ngx.var.uri)

-- Record transaction asynchronously (only if we have a tx_hash)
local tx_hash = settle_response.txHash
if tx_hash then
    local tx_network = matching_req.network
    local tx_amount = tonumber(price) or 0
    local tx_request_path = ngx.var.uri
    local tx_tenant_name = tenant_name
    local tx_endpoint_id = matched_endpoint_id
    ngx.timer.at(0, function(premature)
        if premature then return end
        local http = require("resty.http").new()
        local tx_body = cjson.encode({
            tx_hash = tx_hash,
            tenant_name = tx_tenant_name,
            endpoint_id = tx_endpoint_id or cjson.null,
            amount_usdc = tx_amount,
            network = tx_network,
            request_path = tx_request_path
        })
        local tx_res, tx_err = http:request_uri("http://10.12.0.1:1337/internal/transactions", {
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
