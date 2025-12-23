"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
} from "@radix-ui/react-icons";

interface CorbitsTransaction {
  id: number;
  chain: string;
  signature: string;
  block_time: string;
  from_address: string | null;
  to_address: string | null;
  amount: string;
  direction: "incoming" | "outgoing" | "fee" | null;
  status: "pending" | "confirmed" | "finalized" | "failed";
  mint_address: string | null;
  tracked_address_id: number;
  created_at: string;
}

interface TransactionsResponse {
  transactions: CorbitsTransaction[];
  total: number;
  limit: number;
  offset: number;
  cached?: boolean;
  error?: string;
}

interface AdminTransactionsTableProps {
  tenantId: number;
  pageSize?: number;
}

function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

function getExplorerUrl(chain: string, signature: string): string {
  switch (chain) {
    case "solana":
      return `https://solscan.io/tx/${signature}`;
    case "base":
      return `https://basescan.org/tx/${signature}`;
    case "polygon":
      return `https://polygonscan.com/tx/${signature}`;
    case "monad":
      return `https://explorer.monad.xyz/tx/${signature}`;
    default:
      return "#";
  }
}

export function AdminTransactionsTable({
  tenantId,
  pageSize = 10,
}: AdminTransactionsTableProps) {
  const [page, setPage] = useState(0);
  const offset = page * pageSize;

  const { data, isLoading, error } = useSWR<TransactionsResponse>(
    `/api/admin/tenants/${tenantId}/corbits-transactions?limit=${pageSize}&offset=${offset}`,
    api.get,
    { refreshInterval: 60000 },
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

  if (error || data?.error) {
    return (
      <div className="rounded-lg border border-gray-6 bg-gray-2 px-4 py-3">
        <p className="text-sm text-gray-11">
          {data?.error || "Failed to load transactions"}
        </p>
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
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-gray-6 bg-gray-3">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-11">
                Chain
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-11">
                Signature
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-11">
                Direction
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-11">
                Amount
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-11">
                Status
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
                  <span className="text-sm font-medium text-gray-12">
                    {tx.chain}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <code className="rounded bg-gray-3 px-1.5 py-0.5 font-mono text-xs text-gray-12">
                      {truncateAddress(tx.signature, 8)}
                    </code>
                    <a
                      href={getExplorerUrl(tx.chain, tx.signature)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12"
                    >
                      <ExternalLinkIcon className="h-3 w-3" />
                    </a>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      tx.direction === "incoming"
                        ? "bg-green-900/30 text-green-400"
                        : tx.direction === "outgoing"
                          ? "bg-red-900/30 text-red-400"
                          : "bg-gray-900/30 text-gray-400"
                    }`}
                  >
                    {tx.direction === "incoming"
                      ? "IN"
                      : tx.direction === "outgoing"
                        ? "OUT"
                        : tx.direction || "-"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm font-medium text-gray-12">
                    ${tx.amount}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      tx.status === "finalized" || tx.status === "confirmed"
                        ? "bg-green-900/30 text-green-400"
                        : tx.status === "failed"
                          ? "bg-red-900/30 text-red-400"
                          : "bg-yellow-900/30 text-yellow-400"
                    }`}
                  >
                    {tx.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-gray-11">
                    {tx.block_time
                      ? new Date(tx.block_time).toLocaleString()
                      : "Pending"}
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
