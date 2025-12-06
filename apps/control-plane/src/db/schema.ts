import type { ColumnType } from "kysely";

export interface Database {
  tenants: TenantsTable;
  nodes: NodesTable;
  endpoints: EndpointsTable;
  transactions: TransactionsTable;
  organizations: OrganizationsTable;
  users: UsersTable;
  user_organizations: UserOrganizationsTable;
  tenant_nodes: TenantNodesTable;
}

export interface OrganizationsTable {
  id: ColumnType<number, never, never>;
  name: string;
  slug: string;
  is_admin: ColumnType<boolean, boolean | undefined, boolean>;
  wallet_config: ColumnType<unknown, string | undefined, string> | null;
  created_at: ColumnType<Date, never, never>;
}

export interface UsersTable {
  id: ColumnType<number, never, never>;
  email: string;
  password_hash: string;
  is_admin: ColumnType<boolean, boolean | undefined, boolean>;
  email_verified: ColumnType<boolean, boolean | undefined, boolean>;
  verification_token: string | null;
  verification_expires: Date | null;
  created_at: ColumnType<Date, never, never>;
}

export interface UserOrganizationsTable {
  id: ColumnType<number, never, never>;
  user_id: number;
  organization_id: number;
  role: string;
  joined_at: ColumnType<Date, never, never>;
}

export interface TenantsTable {
  id: ColumnType<number, never, never>;
  name: string;
  backend_url: string;
  node_id: number | null;
  organization_id: number | null;
  wallet_config: ColumnType<unknown, string, string>;
  default_price_usdc: number;
  default_scheme: string;
  upstream_auth_header: string | null;
  upstream_auth_value: string | null;
  is_active: ColumnType<boolean, boolean | undefined, boolean>;
  created_at: ColumnType<Date, never, never>;
}

export interface NodesTable {
  id: ColumnType<number, never, never>;
  name: string;
  internal_ip: string;
  public_ip: string | null;
  status: string;
  wireguard_public_key: string | null;
  wireguard_address: string | null;
  created_at: ColumnType<Date, never, never>;
}

export interface TenantNodesTable {
  id: ColumnType<number, never, never>;
  tenant_id: number;
  node_id: number;
  is_primary: ColumnType<boolean, boolean | undefined, boolean>;
  health_check_id: string | null;
  cert_status: string | null;
  created_at: ColumnType<Date, never, never>;
}

export interface EndpointsTable {
  id: ColumnType<number, never, never>;
  tenant_id: number;
  path_pattern: string;
  price_usdc: number | null;
  scheme: string | null;
  description: string | null;
  priority: ColumnType<number, number | undefined, number>;
  is_active: ColumnType<boolean, boolean | undefined, boolean>;
  created_at: ColumnType<Date, never, never>;
  deleted_at: Date | null;
}

export interface TransactionsTable {
  id: ColumnType<number, never, never>;
  endpoint_id: number | null;
  tenant_id: number;
  amount_usdc: number;
  tx_hash: string;
  network: string;
  request_path: string;
  created_at: ColumnType<Date, never, never>;
}
