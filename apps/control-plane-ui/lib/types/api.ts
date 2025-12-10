import { type } from "arktype";

export const TenantSchema = type({
  id: "number",
  name: "string",
  backend_url: "string",
  "node_id?": "number | null",
  wallet_config: "unknown",
  default_price_usdc: "number",
  default_scheme: "string",
  "upstream_auth_header?": "string | null",
  "upstream_auth_value?": "string | null",
  is_active: "boolean",
  created_at: "string",
});

export type Tenant = typeof TenantSchema.infer;

export const NodeSchema = type({
  id: "number",
  name: "string",
  internal_ip: "string",
  "public_ip?": "string | null",
  status: "string",
  "wireguard_public_key?": "string | null",
  "wireguard_address?": "string | null",
  created_at: "string",
});

export type Node = typeof NodeSchema.infer;

export const EndpointSchema = type({
  id: "number",
  tenant_id: "number",
  path_pattern: "string",
  "price_usdc?": "number | null",
  "scheme?": "string | null",
  "description?": "string | null",
  priority: "number",
  is_active: "boolean",
  created_at: "string",
  "deleted_at?": "string | null",
});

export type Endpoint = typeof EndpointSchema.infer;

export const TransactionSchema = type({
  id: "number",
  "endpoint_id?": "number | null",
  tenant_id: "number",
  amount_usdc: "number",
  tx_hash: "string",
  network: "string",
  request_path: "string",
  created_at: "string",
});

export type Transaction = typeof TransactionSchema.infer;
