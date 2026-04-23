"use client";

import useSWR from "swr";
import * as Tooltip from "@radix-ui/react-tooltip";
import { api } from "@/lib/api/client";
import { InlineActiveToggle } from "@/components/shared/inline-active-toggle";

interface Node {
  id: number;
  name: string;
  internal_ip: string;
  public_ip: string;
  status: string;
  created_at: string;
}

interface TenantNode {
  id: number;
  name: string;
  backend_url: string;
  is_active: boolean;
  is_primary: boolean;
  cert_status: "pending" | "provisioned" | "failed" | "deleting";
  wallet_funding_status: "pending" | "funded" | "failed";
}

export default function AdminNodesPage() {
  const { data: nodes, isLoading } = useSWR(
    "/api/admin/nodes",
    api.get<Node[]>,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-12">Nodes</h1>
        <p className="text-sm text-gray-11">
          Infrastructure nodes and tenant assignments
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
        </div>
      ) : nodes?.length ? (
        <div className="space-y-6">
          {nodes.map((node) => (
            <NodeCard key={node.id} node={node} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-6 text-center">
          <p className="text-sm text-gray-11">No nodes found.</p>
        </div>
      )}
    </div>
  );
}

function NodeCard({ node }: { node: Node }) {
  const {
    data: tenants,
    isLoading,
    mutate,
  } = useSWR(`/api/admin/nodes/${node.id}/tenants`, api.get<TenantNode[]>, {
    refreshInterval: 3000,
  });

  return (
    <div className="rounded-lg border border-gray-6 bg-gray-2 overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-6 bg-gray-3 px-4 py-3">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-medium text-gray-12">{node.name}</h2>
          <code className="rounded bg-gray-4 px-2 py-1 text-xs text-gray-11">
            {node.internal_ip}
          </code>
          {node.public_ip && (
            <code className="rounded bg-gray-4 px-2 py-1 text-xs text-gray-11">
              {node.public_ip}
            </code>
          )}
        </div>
        <NodeHealthIndicator nodeId={node.id} />
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
          </div>
        ) : tenants?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-6">
                  <th className="pb-2 text-left text-xs font-medium text-gray-11">
                    Tenant
                  </th>
                  <th className="pb-2 text-left text-xs font-medium text-gray-11"></th>
                  <th className="pb-2 text-left text-xs font-medium text-gray-11">
                    Backend URL
                  </th>
                  <th className="pb-2 text-left text-xs font-medium text-gray-11">
                    Active
                  </th>
                  <th className="pb-2 text-left text-xs font-medium text-gray-11">
                    TLS Cert
                  </th>
                  <th className="pb-2 text-left text-xs font-medium text-gray-11">
                    Funding
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-6">
                {tenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <td className="py-2 align-middle">
                      <span className="text-sm font-medium text-gray-12">
                        {tenant.name}
                      </span>
                    </td>
                    <td className="py-2 align-middle">
                      {tenant.is_primary && (
                        <span className="inline-flex rounded-full border border-blue-800 bg-blue-900/50 px-2 py-0.5 text-xs text-blue-400">
                          Primary
                        </span>
                      )}
                    </td>
                    <td className="py-2 align-middle">
                      <Tooltip.Provider delayDuration={200}>
                        <Tooltip.Root>
                          <Tooltip.Trigger asChild>
                            <code className="rounded bg-gray-4 px-1.5 py-0.5 text-xs text-gray-11 cursor-default">
                              {tenant.backend_url.length > 50
                                ? `${tenant.backend_url.slice(0, 50)}...`
                                : tenant.backend_url}
                            </code>
                          </Tooltip.Trigger>
                          <Tooltip.Portal>
                            <Tooltip.Content
                              className="rounded bg-gray-12 px-2 py-1 text-xs text-gray-1"
                              sideOffset={5}
                            >
                              {tenant.backend_url}
                              <Tooltip.Arrow className="fill-gray-12" />
                            </Tooltip.Content>
                          </Tooltip.Portal>
                        </Tooltip.Root>
                      </Tooltip.Provider>
                    </td>
                    <td className="py-2 align-middle">
                      <InlineActiveToggle
                        tenantId={tenant.id}
                        tenantName={tenant.name}
                        isActive={tenant.is_active}
                        onUpdate={() => void mutate()}
                      />
                    </td>
                    <td className="py-2 align-middle">
                      <CertStatusBadge status={tenant.cert_status} />
                    </td>
                    <td className="py-2 align-middle">
                      <FundingStatusBadge
                        status={tenant.wallet_funding_status}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-gray-11">
            No tenants assigned
          </p>
        )}
      </div>
    </div>
  );
}

function NodeHealthIndicator({ nodeId }: { nodeId: number }) {
  const { data } = useSWR(
    `/api/admin/nodes/${nodeId}/health`,
    api.get<{ healthy: boolean }>,
    { refreshInterval: 10000 },
  );
  const healthy = data?.healthy ?? false;

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="relative flex h-[10px] w-[10px] cursor-default items-center justify-center">
            {healthy && (
              <span
                className="absolute h-[10px] w-[10px] rounded-full bg-green-500"
                style={{
                  animation: "healthPulse 2s ease-out infinite",
                }}
              />
            )}
            <span
              className={`relative h-[10px] w-[10px] rounded-full ${
                healthy ? "bg-green-500" : "bg-red-500"
              }`}
              style={
                !healthy
                  ? { animation: "healthFlash 1s ease-in-out infinite" }
                  : undefined
              }
            />
            <style>{`
              @keyframes healthPulse {
                0% { transform: scale(1); opacity: 0.7; }
                100% { transform: scale(2.5); opacity: 0; }
              }
              @keyframes healthFlash {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.3; }
              }
            `}</style>
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="rounded bg-gray-12 px-2 py-1 text-xs text-gray-1"
            sideOffset={5}
          >
            {healthy ? "Node is healthy" : "Node is unreachable"}
            <Tooltip.Arrow className="fill-gray-12" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

function CertStatusBadge({
  status,
}: {
  status: "pending" | "provisioned" | "failed" | "deleting";
}) {
  const config = {
    pending: {
      className: "border-yellow-800 bg-yellow-900/50 text-yellow-400",
      label: "Pending",
      pulse: true,
    },
    provisioned: {
      className: "border-green-800 bg-green-900/50 text-green-400",
      label: "Provisioned",
      pulse: false,
    },
    deleting: {
      className: "border-red-800 bg-red-900/50 text-red-400",
      label: "Deleting",
      pulse: true,
    },
    failed: {
      className: "border-red-800 bg-red-900/50 text-red-400",
      label: "Failed",
      pulse: false,
    },
  };

  const { className, label, pulse } = config[status] ?? config.pending;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${className} ${pulse ? "animate-pulse" : ""}`}
    >
      {label}
    </span>
  );
}

function FundingStatusBadge({
  status,
}: {
  status: "pending" | "funded" | "failed";
}) {
  const config = {
    pending: {
      className: "border-red-800 bg-red-900/50 text-red-400",
      label: "No Wallet",
      pulse: false,
    },
    funded: {
      className: "border-green-800 bg-green-900/50 text-green-400",
      label: "Funded",
      pulse: false,
    },
    failed: {
      className: "border-red-800 bg-red-900/50 text-red-400",
      label: "Failed",
      pulse: false,
    },
  };

  const { className, label, pulse } = config[status] ?? config.pending;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${className} ${pulse ? "animate-pulse" : ""}`}
    >
      {label}
    </span>
  );
}
