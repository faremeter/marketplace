export interface EarningsAnalytics {
  total_earned: number;
  current_month_earned: number;
  previous_month_earned: number;
  percent_change: number | null;
  total_transactions: number;
}

export function formatUSDC(amount?: number): string {
  if (amount === undefined || amount === null) return "$0.00";
  return `$${(amount / 1_000_000).toFixed(2)}`;
}

export function getValueColor(amount?: number): string {
  if (amount === undefined || amount === null || amount === 0)
    return "text-white";
  return amount > 0 ? "text-green-500" : "text-red-500";
}

export function getChangeColor(change?: number | null): string {
  if (change === undefined || change === null || change === 0)
    return "text-gray-9";
  return change > 0 ? "text-green-500" : "text-red-500";
}

export function formatChange(change?: number | null): string {
  if (change === undefined || change === null) return "-";
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
}

export function formatTokenAmount(
  microAmount: number,
  symbol: string,
  decimals = 6,
): string {
  const amount = microAmount / 10 ** decimals;
  return `${amount.toFixed(2)} ${symbol}`;
}
