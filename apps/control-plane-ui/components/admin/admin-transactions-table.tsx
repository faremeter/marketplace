"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
} from "@radix-ui/react-icons";
import { formatUSDC } from "@/lib/analytics";

interface Transaction {
  id: number;
  endpoint_id: number | null;
  tenant_id: number;
  amount_usdc: number;
  tx_hash: string | null;
  network: string | null;
  request_path: string;
  created_at: string;
}

interface TransactionsResponse {
  transactions: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

interface AdminTransactionsTableProps {
  tenantId: number;
  pageSize?: number;
}

function truncateHash(hash: string, chars = 8): string {
  if (hash.length <= chars * 2 + 3) return hash;
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`;
}

function getExplorerUrl(network: string | null, txHash: string): string {
  switch (network) {
    case "solana":
      return `https://solscan.io/tx/${txHash}`;
    case "base":
      return `https://basescan.org/tx/${txHash}`;
    case "polygon":
      return `https://polygonscan.com/tx/${txHash}`;
    case "monad":
      return `https://explorer.monad.xyz/tx/${txHash}`;
    default:
      return `https://solscan.io/tx/${txHash}`;
  }
}

export function AdminTransactionsTable({
  tenantId,
  pageSize = 10,
}: AdminTransactionsTableProps) {
  const [page, setPage] = useState(0);
  const offset = page * pageSize;

  const { data, isLoading, error } = useSWR<TransactionsResponse>(
    `/api/admin/tenants/${tenantId}/transactions?limit=${pageSize}&offset=${offset}`,
    api.get,
    { refreshInterval: 30000 },
  );

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-gray-6 bg-gray-2 px-4 py-3">
        <p className="text-sm text-gray-11">Failed to load transactions</p>
      </div>
    );
  }

  if (!data?.transactions?.length) {
    return (
      <div className="rounded-lg border border-gray-6 bg-gray-2 px-4 py-3">
        <p className="text-sm text-gray-11">No transactions found</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-6 bg-gray-2">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-gray-6 bg-gray-3">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-11">
                Path
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-11">
                Amount
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-11">
                Network
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-11">
                TX Hash
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-11">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-6">
            {data.transactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-gray-3">
                <td className="px-4 py-3">
                  <code className="rounded bg-gray-3 px-1.5 py-0.5 font-mono text-xs text-gray-12">
                    {tx.request_path}
                  </code>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm font-medium text-green-400">
                    {formatUSDC(tx.amount_usdc)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {tx.network ? (
                    <span className="inline-flex rounded-full border border-gray-6 bg-gray-4 px-2 py-0.5 text-xs text-gray-11">
                      {tx.network}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-11">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {tx.tx_hash ? (
                    <div className="flex items-center gap-1.5">
                      <code className="rounded bg-gray-3 px-1.5 py-0.5 font-mono text-xs text-gray-12">
                        {truncateHash(tx.tx_hash)}
                      </code>
                      <a
                        href={getExplorerUrl(tx.network, tx.tx_hash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12"
                      >
                        <ExternalLinkIcon className="h-3 w-3" />
                      </a>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-11">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-gray-11">
                    {new Date(tx.created_at).toLocaleString()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-11">
            Showing {offset + 1}-{Math.min(offset + pageSize, data.total)} of{" "}
            {data.total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={!hasPrevPage}
              className="rounded p-1.5 text-gray-11 hover:bg-gray-4 hover:text-gray-12 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span className="text-sm text-gray-11">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNextPage}
              className="rounded p-1.5 text-gray-11 hover:bg-gray-4 hover:text-gray-12 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
