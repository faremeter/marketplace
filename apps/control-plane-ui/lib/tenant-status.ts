export interface TenantNode {
  id: number;
  name?: string;
  cert_status: string | null;
  is_primary: boolean;
}

export interface TenantStatusInput {
  status: string;
  is_active: boolean;
  wallet_id: number | null;
  wallet_funding_status: string | null;
  nodes: TenantNode[];
}

export interface StatusDisplay {
  label: string;
  color: string;
  tooltip: string;
  pulse: boolean;
}

export function getTenantStatus(tenant: TenantStatusInput): StatusDisplay {
  if (tenant.status === "deleting") {
    return {
      label: "Deleting",
      tooltip: "Tenant is being removed",
      color: "bg-red-900/50 text-red-400 border-red-800",
      pulse: true,
    };
  }

  if (tenant.status === "failed") {
    const hasCertFailed = tenant.nodes?.some((n) => n.cert_status === "failed");
    return {
      label: "Failed",
      tooltip: hasCertFailed
        ? "TLS certificate provisioning failed"
        : "Setup failed",
      color: "bg-red-900/50 text-red-400 border-red-800",
      pulse: false,
    };
  }

  const hasCertPending = tenant.nodes?.some((n) => n.cert_status === "pending");
  if (hasCertPending) {
    return {
      label: "Provisioning",
      tooltip: "TLS certificate is being provisioned",
      color: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
      pulse: true,
    };
  }

  const hasCertDeleting = tenant.nodes?.some(
    (n) => n.cert_status === "deleting",
  );
  if (hasCertDeleting) {
    return {
      label: "Updating",
      tooltip: "Node configuration is being updated",
      color: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
      pulse: true,
    };
  }

  if (!tenant.wallet_id) {
    return {
      label: "No Wallet",
      tooltip: "No wallet assigned - tenant cannot process requests",
      color: "bg-red-900/50 text-red-400 border-red-800",
      pulse: false,
    };
  }

  if (tenant.wallet_funding_status !== "funded") {
    return {
      label: "Unfunded",
      tooltip: "Wallet not funded - tenant cannot process requests",
      color: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
      pulse: false,
    };
  }

  if (!tenant.is_active) {
    return {
      label: "Inactive",
      tooltip: "Tenant is disabled",
      color: "bg-gray-800/50 text-gray-400 border-gray-700",
      pulse: false,
    };
  }

  return {
    label: "Ready",
    tooltip: "Tenant is fully operational",
    color: "bg-green-900/50 text-green-400 border-green-800",
    pulse: false,
  };
}

export function isDeleteDisabled(
  tenant: TenantStatusInput,
  isDeletingThis: boolean,
): boolean {
  if (isDeletingThis) return true;
  if (tenant.status === "deleting") return true;

  const hasCertInFlight = tenant.nodes?.some(
    (n) => n.cert_status === "pending" || n.cert_status === "deleting",
  );
  return !!hasCertInFlight;
}

export function getDeleteDisabledReason(
  tenant: TenantStatusInput,
): string | null {
  if (tenant.status === "deleting") {
    return "Tenant is already being deleted";
  }

  const hasCertPending = tenant.nodes?.some((n) => n.cert_status === "pending");
  if (hasCertPending) {
    return "Cannot delete while TLS certificate is being provisioned";
  }

  const hasCertDeleting = tenant.nodes?.some(
    (n) => n.cert_status === "deleting",
  );
  if (hasCertDeleting) {
    return "Cannot delete while node removal is in progress";
  }

  return null;
}
