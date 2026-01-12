import { type } from "arktype";

export const MAX_NAME_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 1024;
export const MAX_AUTH_HEADER_LENGTH = 256;
export const MAX_AUTH_VALUE_LENGTH = 2048;
export const MAX_PATH_LENGTH = 2048;
export const MAX_IP_LENGTH = 45;
export const MAX_PUBKEY_LENGTH = 256;
export const MIN_PRICE_USDC = 1; // $0.000001 in micro-USDC (minimum non-free price)
export const MAX_PRICE_USDC = 100000000; // $100 in micro-USDC
export const MAX_PRIORITY = 10000;

export const CreateEndpointSchema = type({
  path: "string > 0",
  "path_pattern?": "string",
  "price_usdc?": `0 <= number <= ${MAX_PRICE_USDC} | null`,
  "scheme?": "'exact' | 'per_request' | 'per_byte' | null",
  "description?": `string <= ${MAX_DESCRIPTION_LENGTH} | null`,
  "priority?": `0 <= number <= ${MAX_PRIORITY}`,
  "openapi_source_paths?": "string[]",
});

export const UpdateEndpointSchema = type({
  "path?": "string > 0",
  "price_usdc?": `0 <= number <= ${MAX_PRICE_USDC} | null`,
  "scheme?": "'exact' | 'per_request' | 'per_byte' | null",
  "description?": `string <= ${MAX_DESCRIPTION_LENGTH} | null`,
  "priority?": `0 <= number <= ${MAX_PRIORITY}`,
  "is_active?": "boolean",
  "openapi_source_paths?": "string[]",
});

export const CreateTenantSchema = type({
  name: "string > 0",
  backend_url: "string",
  "wallet_id?": "number | null",
  "default_price_usdc?": `0 <= number <= ${MAX_PRICE_USDC}`,
  "default_scheme?": "'exact' | 'per_request' | 'per_byte' | null",
  "upstream_auth_header?": `string <= ${MAX_AUTH_HEADER_LENGTH} | null`,
  "upstream_auth_value?": `string <= ${MAX_AUTH_VALUE_LENGTH} | null`,
  "is_active?": "boolean",
  "organization_id?": "number | null",
});

export const UpdateTenantSchema = type({
  "name?": "string > 0",
  "backend_url?": "string | null",
  "organization_id?": "number | null",
  "wallet_id?": "number | null",
  "default_price_usdc?": `0 <= number <= ${MAX_PRICE_USDC}`,
  "default_scheme?": "'exact' | 'per_request' | 'per_byte' | null",
  "upstream_auth_header?": `string <= ${MAX_AUTH_HEADER_LENGTH} | null`,
  "upstream_auth_value?": `string <= ${MAX_AUTH_VALUE_LENGTH} | null`,
  "is_active?": "boolean",
});

export const CreateNodeSchema = type({
  name: `string <= ${MAX_NAME_LENGTH}`,
  internal_ip: `string <= ${MAX_IP_LENGTH}`,
  "public_ip?": `string <= ${MAX_IP_LENGTH} | null`,
  "status?": "'active' | 'inactive'",
  "wireguard_public_key?": `string <= ${MAX_PUBKEY_LENGTH} | null`,
  "wireguard_address?": `string <= ${MAX_IP_LENGTH} | null`,
});

export const UpdateNodeSchema = type({
  "name?": `string <= ${MAX_NAME_LENGTH}`,
  "internal_ip?": `string <= ${MAX_IP_LENGTH}`,
  "public_ip?": `string <= ${MAX_IP_LENGTH} | null`,
  "status?": "'active' | 'inactive'",
  "wireguard_public_key?": `string <= ${MAX_PUBKEY_LENGTH} | null`,
  "wireguard_address?": `string <= ${MAX_IP_LENGTH} | null`,
});

export const CreateWalletSchema = type({
  name: `string > 0 & string <= ${MAX_NAME_LENGTH}`,
  wallet_config: "unknown",
});

export const UpdateWalletSchema = type({
  "name?": `string <= ${MAX_NAME_LENGTH}`,
  "wallet_config?": "unknown",
});

export const OrgCreateTenantSchema = type({
  name: "string > 0",
  backend_url: "string",
  wallet_id: "number",
  "default_price_usdc?": `0 <= number <= ${MAX_PRICE_USDC}`,
  "default_scheme?": "'exact' | 'per_request' | 'per_byte' | null",
  "upstream_auth_header?": `string <= ${MAX_AUTH_HEADER_LENGTH} | null`,
  "upstream_auth_value?": `string <= ${MAX_AUTH_VALUE_LENGTH} | null`,
});

export const OrgUpdateTenantSchema = type({
  "name?": "string > 0",
  "backend_url?": "string | null",
  "wallet_id?": "number | null",
  "default_price_usdc?": `0 <= number <= ${MAX_PRICE_USDC}`,
  "default_scheme?": "'exact' | 'per_request' | 'per_byte' | null",
  "upstream_auth_header?": `string <= ${MAX_AUTH_HEADER_LENGTH} | null`,
  "upstream_auth_value?": `string <= ${MAX_AUTH_VALUE_LENGTH} | null`,
  "is_active?": "boolean",
});

export const AddMemberSchema = type({
  email: "string.email",
  "role?": "'owner' | 'admin' | 'member'",
});

export const UpdateMemberSchema = type({
  role: "'owner' | 'admin' | 'member'",
});

export const AdminCreateTenantSchema = type({
  name: "string > 0",
  backend_url: "string",
  "wallet_id?": "number | null",
  "organization_id?": "number | null",
  "node_id?": "number | null",
  "node_ids?": "number[]",
  "default_price_usdc?": `0 <= number <= ${MAX_PRICE_USDC}`,
  "default_scheme?": "'exact' | 'per_request' | 'per_byte' | null",
  "upstream_auth_header?": `string <= ${MAX_AUTH_HEADER_LENGTH} | null`,
  "upstream_auth_value?": `string <= ${MAX_AUTH_VALUE_LENGTH} | null`,
});

export const AdminUpdateTenantSchema = type({
  "name?": "string > 0",
  "backend_url?": "string | null",
  "organization_id?": "number | null",
  "wallet_id?": "number | null",
  "is_active?": "boolean",
  "upstream_auth_header?": `string <= ${MAX_AUTH_HEADER_LENGTH} | null`,
  "upstream_auth_value?": `string <= ${MAX_AUTH_VALUE_LENGTH} | null`,
});

export const AdminUpdateEndpointSchema = type({
  "path?": `string <= ${MAX_PATH_LENGTH}`,
  "price_usdc?": `0 <= number <= ${MAX_PRICE_USDC} | null`,
  "scheme?": "'exact' | 'per_request' | 'per_byte' | null",
  "description?": `string <= ${MAX_DESCRIPTION_LENGTH} | null`,
  "priority?": `0 <= number <= ${MAX_PRIORITY}`,
});

export const MIN_PASSWORD_LENGTH = 8;

export const SignupSchema = type({
  email: "string.email",
  password: `string >= ${MIN_PASSWORD_LENGTH}`,
});

export const LoginSchema = type({
  email: "string.email",
  password: "string > 0",
});

export const VerifyEmailSchema = type({
  token: "string > 0",
});

const ORG_NAME_PATTERN = /^[a-zA-Z0-9 -]+$/;
const MAX_SLUG_LENGTH = 63;

const orgName = type(`string > 0 & string <= ${MAX_NAME_LENGTH}`).narrow(
  (s, ctx) => {
    if (!ORG_NAME_PATTERN.test(s)) {
      return ctx.mustBe(
        "containing only letters, numbers, spaces, and hyphens",
      );
    }
    if (/ {2}/.test(s)) {
      return ctx.mustBe("without consecutive spaces");
    }
    if (s.startsWith("-")) {
      return ctx.mustBe("not starting with a hyphen");
    }
    if (s.endsWith("-")) {
      return ctx.mustBe("not ending with a hyphen");
    }
    return true;
  },
);

const orgSlug = type(`string > 0 & string <= ${MAX_SLUG_LENGTH}`).narrow(
  (s, ctx) => {
    if (s.length === 1) {
      if (!/^[a-z0-9]$/.test(s)) {
        return ctx.mustBe("a lowercase letter or number");
      }
    } else if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(s)) {
      return ctx.mustBe(
        "lowercase alphanumeric, starting and ending with letter or number",
      );
    }
    return true;
  },
);

export const CreateOrganizationSchema = type({
  name: orgName,
  "slug?": orgSlug.or(type("undefined")),
});

export const UpdateOrganizationSchema = type({
  "name?": orgName.or(type("undefined")),
  "slug?": orgSlug.or(type("undefined")),
});

export const AssignNodeSchema = type({
  node_id: "number",
  "is_primary?": "boolean",
});

export const WaitlistSchema = type({
  email: "string.email",
});

export const AdminUpdateUserSchema = type({
  "is_admin?": "boolean",
  "email_verified?": "boolean",
});

export const AdminUpdateSettingsSchema = type({
  "wallet_config?": "unknown | null",
  "minimum_balance_sol?": "0.001 <= number <= 1",
  "minimum_balance_usdc?": "0.001 <= number <= 100",
});

export const InternalTransactionSchema = type({
  ngx_request_id: `string > 0 & string <= ${MAX_NAME_LENGTH}`,
  tenant_name: `string > 0 & string <= ${MAX_SLUG_LENGTH}`,
  "org_slug?": `string <= ${MAX_SLUG_LENGTH} | null`,
  "endpoint_id?": "number | null",
  amount_usdc: "number >= 0",
  "tx_hash?": `string <= ${MAX_NAME_LENGTH} | null`,
  "network?": "string <= 50 | null",
  request_path: `string > 0 & string <= ${MAX_PATH_LENGTH}`,
});

export const AdminAssignNodeSchema = type({
  node_id: "number",
});

export const OpenApiImportSchema = type({
  spec: "unknown",
});

export const ValidatePatternSchema = type({
  pattern: "string > 0",
});
