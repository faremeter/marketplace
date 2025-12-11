"use client";

import { useAuth } from "@/lib/auth/context";
import useSWR from "swr";
import { api } from "@/lib/api/client";

interface Endpoint {
  id: number;
  resource_address: string;
  price_per_request_usdc: string;
  created_at: string;
}

export default function EndpointsPage() {
  const { currentOrg } = useAuth();

  const { data: endpoints, isLoading } = useSWR(
    currentOrg ? `/api/organizations/${currentOrg.id}/endpoints` : null,
    api.get<Endpoint[]>,
  );

  if (!currentOrg) {
    return (
      <div className="rounded-lg border border-gray-6 bg-gray-2 p-6">
        <h2 className="mb-2 text-lg font-medium text-gray-12">
          No Organization Selected
        </h2>
        <p className="text-sm text-gray-11">
          Select an organization from the sidebar to view endpoints.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-12">Endpoints</h1>
          <p className="text-sm text-gray-11">
            API endpoints for {currentOrg.name}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
        </div>
      ) : endpoints?.length ? (
        <div className="overflow-hidden rounded-lg border border-gray-6">
          <table className="w-full">
            <thead className="bg-gray-3">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Resource Address
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Price per Request
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-6 bg-gray-2">
              {endpoints.map((endpoint) => (
                <tr key={endpoint.id} className="hover:bg-gray-3">
                  <td className="px-4 py-3">
                    <code className="rounded bg-gray-4 px-2 py-1 text-sm text-gray-12">
                      {endpoint.resource_address}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-11">
                    ${parseFloat(endpoint.price_per_request_usdc).toFixed(6)}{" "}
                    USDC
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-11">
                    {new Date(endpoint.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-6 text-center">
          <p className="text-sm text-gray-11">No endpoints found.</p>
        </div>
      )}
    </div>
  );
}
