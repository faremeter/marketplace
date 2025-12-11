"use client";

import useSWR from "swr";
import { api } from "@/lib/api/client";

interface Transaction {
  id: number;
  resource_address: string;
  amount_usdc: string;
  payer_address: string;
  payee_address: string;
  created_at: string;
}

export default function AdminTransactionsPage() {
  const { data: transactions, isLoading } = useSWR(
    "/api/admin/transactions",
    api.get<Transaction[]>,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-12">Transactions</h1>
        <p className="text-sm text-gray-11">All payment transactions</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
        </div>
      ) : transactions?.length ? (
        <div className="overflow-hidden rounded-lg border border-gray-6">
          <table className="w-full">
            <thead className="bg-gray-3">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  ID
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Resource
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Payer
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Payee
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-6 bg-gray-2">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-3">
                  <td className="px-4 py-3 text-sm text-gray-11">{tx.id}</td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-gray-4 px-2 py-1 text-xs text-gray-11">
                      {tx.resource_address.slice(0, 20)}...
                    </code>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-12">
                    ${parseFloat(tx.amount_usdc).toFixed(6)} USDC
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-gray-4 px-2 py-1 text-xs text-gray-11">
                      {tx.payer_address.slice(0, 10)}...
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-gray-4 px-2 py-1 text-xs text-gray-11">
                      {tx.payee_address.slice(0, 10)}...
                    </code>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-11">
                    {new Date(tx.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-6 text-center">
          <p className="text-sm text-gray-11">No transactions found.</p>
        </div>
      )}
    </div>
  );
}
