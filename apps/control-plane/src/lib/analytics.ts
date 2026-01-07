import { db } from "../db/instance.js";
import { sql } from "kysely";

export interface EarningsAnalytics {
  total_earned_usdc: number;
  current_month_earned_usdc: number;
  previous_month_earned_usdc: number;
  percent_change: number | null;
  total_transactions: number;
}

export interface MonthlyEarnings {
  month: string;
  total_usdc: number;
}

function getMonthBoundaries(): {
  currentMonthStart: Date;
  previousMonthStart: Date;
} {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { currentMonthStart, previousMonthStart };
}

function calculatePercentChange(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export async function getPlatformEarnings(): Promise<EarningsAnalytics> {
  const { currentMonthStart, previousMonthStart } = getMonthBoundaries();

  const [totals, currentMonth, previousMonth] = await Promise.all([
    db
      .selectFrom("transactions")
      .select([
        sql<number>`COALESCE(SUM(amount_usdc), 0)`.as("total"),
        sql<number>`COUNT(*)`.as("count"),
      ])
      .executeTakeFirst(),

    db
      .selectFrom("transactions")
      .select(sql<number>`COALESCE(SUM(amount_usdc), 0)`.as("total"))
      .where("created_at", ">=", currentMonthStart)
      .executeTakeFirst(),

    db
      .selectFrom("transactions")
      .select(sql<number>`COALESCE(SUM(amount_usdc), 0)`.as("total"))
      .where("created_at", ">=", previousMonthStart)
      .where("created_at", "<", currentMonthStart)
      .executeTakeFirst(),
  ]);

  const totalEarned = Number(totals?.total ?? 0);
  const totalTransactions = Number(totals?.count ?? 0);
  const currentEarned = Number(currentMonth?.total ?? 0);
  const previousEarned = Number(previousMonth?.total ?? 0);

  return {
    total_earned_usdc: totalEarned,
    current_month_earned_usdc: currentEarned,
    previous_month_earned_usdc: previousEarned,
    percent_change: calculatePercentChange(currentEarned, previousEarned),
    total_transactions: totalTransactions,
  };
}

export async function getOrganizationEarnings(
  organizationId: number,
): Promise<EarningsAnalytics> {
  const { currentMonthStart, previousMonthStart } = getMonthBoundaries();

  const [totals, currentMonth, previousMonth] = await Promise.all([
    db
      .selectFrom("transactions")
      .select([
        sql<number>`COALESCE(SUM(amount_usdc), 0)`.as("total"),
        sql<number>`COUNT(*)`.as("count"),
      ])
      .where("organization_id", "=", organizationId)
      .executeTakeFirst(),

    db
      .selectFrom("transactions")
      .select(sql<number>`COALESCE(SUM(amount_usdc), 0)`.as("total"))
      .where("organization_id", "=", organizationId)
      .where("created_at", ">=", currentMonthStart)
      .executeTakeFirst(),

    db
      .selectFrom("transactions")
      .select(sql<number>`COALESCE(SUM(amount_usdc), 0)`.as("total"))
      .where("organization_id", "=", organizationId)
      .where("created_at", ">=", previousMonthStart)
      .where("created_at", "<", currentMonthStart)
      .executeTakeFirst(),
  ]);

  const totalEarned = Number(totals?.total ?? 0);
  const totalTransactions = Number(totals?.count ?? 0);
  const currentEarned = Number(currentMonth?.total ?? 0);
  const previousEarned = Number(previousMonth?.total ?? 0);

  return {
    total_earned_usdc: totalEarned,
    current_month_earned_usdc: currentEarned,
    previous_month_earned_usdc: previousEarned,
    percent_change: calculatePercentChange(currentEarned, previousEarned),
    total_transactions: totalTransactions,
  };
}

export async function getTenantEarnings(
  tenantId: number,
): Promise<EarningsAnalytics> {
  const { currentMonthStart, previousMonthStart } = getMonthBoundaries();

  const [totals, currentMonth, previousMonth] = await Promise.all([
    db
      .selectFrom("transactions")
      .select([
        sql<number>`COALESCE(SUM(amount_usdc), 0)`.as("total"),
        sql<number>`COUNT(*)`.as("count"),
      ])
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst(),

    db
      .selectFrom("transactions")
      .select(sql<number>`COALESCE(SUM(amount_usdc), 0)`.as("total"))
      .where("tenant_id", "=", tenantId)
      .where("created_at", ">=", currentMonthStart)
      .executeTakeFirst(),

    db
      .selectFrom("transactions")
      .select(sql<number>`COALESCE(SUM(amount_usdc), 0)`.as("total"))
      .where("tenant_id", "=", tenantId)
      .where("created_at", ">=", previousMonthStart)
      .where("created_at", "<", currentMonthStart)
      .executeTakeFirst(),
  ]);

  const totalEarned = Number(totals?.total ?? 0);
  const totalTransactions = Number(totals?.count ?? 0);
  const currentEarned = Number(currentMonth?.total ?? 0);
  const previousEarned = Number(previousMonth?.total ?? 0);

  return {
    total_earned_usdc: totalEarned,
    current_month_earned_usdc: currentEarned,
    previous_month_earned_usdc: previousEarned,
    percent_change: calculatePercentChange(currentEarned, previousEarned),
    total_transactions: totalTransactions,
  };
}

export async function getCatchAllEarnings(
  tenantId: number,
): Promise<EarningsAnalytics> {
  const { currentMonthStart, previousMonthStart } = getMonthBoundaries();

  const [totals, currentMonth, previousMonth] = await Promise.all([
    db
      .selectFrom("transactions")
      .select([
        sql<number>`COALESCE(SUM(amount_usdc), 0)`.as("total"),
        sql<number>`COUNT(*)`.as("count"),
      ])
      .where("tenant_id", "=", tenantId)
      .where("endpoint_id", "is", null)
      .executeTakeFirst(),

    db
      .selectFrom("transactions")
      .select(sql<number>`COALESCE(SUM(amount_usdc), 0)`.as("total"))
      .where("tenant_id", "=", tenantId)
      .where("endpoint_id", "is", null)
      .where("created_at", ">=", currentMonthStart)
      .executeTakeFirst(),

    db
      .selectFrom("transactions")
      .select(sql<number>`COALESCE(SUM(amount_usdc), 0)`.as("total"))
      .where("tenant_id", "=", tenantId)
      .where("endpoint_id", "is", null)
      .where("created_at", ">=", previousMonthStart)
      .where("created_at", "<", currentMonthStart)
      .executeTakeFirst(),
  ]);

  const totalEarned = Number(totals?.total ?? 0);
  const totalTransactions = Number(totals?.count ?? 0);
  const currentEarned = Number(currentMonth?.total ?? 0);
  const previousEarned = Number(previousMonth?.total ?? 0);

  return {
    total_earned_usdc: totalEarned,
    current_month_earned_usdc: currentEarned,
    previous_month_earned_usdc: previousEarned,
    percent_change: calculatePercentChange(currentEarned, previousEarned),
    total_transactions: totalTransactions,
  };
}

export async function getEndpointEarnings(
  endpointId: number,
): Promise<EarningsAnalytics> {
  const { currentMonthStart, previousMonthStart } = getMonthBoundaries();

  const [totals, currentMonth, previousMonth] = await Promise.all([
    db
      .selectFrom("transactions")
      .select([
        sql<number>`COALESCE(SUM(amount_usdc), 0)`.as("total"),
        sql<number>`COUNT(*)`.as("count"),
      ])
      .where("endpoint_id", "=", endpointId)
      .executeTakeFirst(),

    db
      .selectFrom("transactions")
      .select(sql<number>`COALESCE(SUM(amount_usdc), 0)`.as("total"))
      .where("endpoint_id", "=", endpointId)
      .where("created_at", ">=", currentMonthStart)
      .executeTakeFirst(),

    db
      .selectFrom("transactions")
      .select(sql<number>`COALESCE(SUM(amount_usdc), 0)`.as("total"))
      .where("endpoint_id", "=", endpointId)
      .where("created_at", ">=", previousMonthStart)
      .where("created_at", "<", currentMonthStart)
      .executeTakeFirst(),
  ]);

  const totalEarned = Number(totals?.total ?? 0);
  const totalTransactions = Number(totals?.count ?? 0);
  const currentEarned = Number(currentMonth?.total ?? 0);
  const previousEarned = Number(previousMonth?.total ?? 0);

  return {
    total_earned_usdc: totalEarned,
    current_month_earned_usdc: currentEarned,
    previous_month_earned_usdc: previousEarned,
    percent_change: calculatePercentChange(currentEarned, previousEarned),
    total_transactions: totalTransactions,
  };
}

export type Granularity = "day" | "week" | "month";

export interface PeriodEarnings {
  period: string;
  total_usdc: number;
  call_count: number;
}

const GRANULARITY_FORMAT: Record<Granularity, string> = {
  day: "YYYY-MM-DD",
  week: "IYYY-IW",
  month: "YYYY-MM",
};

export async function getEarningsByPeriod(
  level: "organization" | "tenant" | "endpoint",
  id: number,
  granularity: Granularity = "month",
  periods = 12,
): Promise<PeriodEarnings[]> {
  const column =
    level === "organization"
      ? "organization_id"
      : level === "tenant"
        ? "tenant_id"
        : "endpoint_id";

  const format = GRANULARITY_FORMAT[granularity];

  const startDate = new Date();
  if (granularity === "day") {
    startDate.setDate(startDate.getDate() - periods);
  } else if (granularity === "week") {
    startDate.setDate(startDate.getDate() - periods * 7);
  } else {
    startDate.setMonth(startDate.getMonth() - periods);
  }

  const result = await db
    .selectFrom("transactions")
    .select([
      sql<string>`TO_CHAR(created_at, ${sql.lit(format)})`.as("period"),
      sql<number>`COALESCE(SUM(amount_usdc), 0)`.as("total_usdc"),
      sql<number>`COUNT(*)`.as("call_count"),
    ])
    .where(column, "=", id)
    .where("created_at", ">=", startDate)
    .groupBy(sql`1`)
    .orderBy(sql`1`, "asc")
    .execute();

  return result.map((r) => ({
    period: r.period,
    total_usdc: Number(r.total_usdc),
    call_count: Number(r.call_count),
  }));
}
