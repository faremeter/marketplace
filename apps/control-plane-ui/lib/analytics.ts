export interface EarningsAnalytics {
  total_earned_usdc: number;
  current_month_earned_usdc: number;
  previous_month_earned_usdc: number;
  percent_change: number | null;
}

export function formatUSDC(amount?: number): string {
  if (amount === undefined || amount === null) return "$0.00";
  return `$${amount.toFixed(2)}`;
}

export function getValueColor(amount?: number): string {
  if (amount === undefined || amount === null || amount === 0)
    return "text-white";
  return amount > 0 ? "text-green-500" : "text-red-500";
}
