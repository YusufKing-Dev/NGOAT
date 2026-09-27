import { StakeDuration } from "@prisma/client";

export const DURATION_DAYS: Record<StakeDuration, number> = {
  THREE_MONTHS: 90,
  SIX_MONTHS: 182,
  ONE_YEAR: 365,
};

/**
 * SIMPLE interest — no compounding. profit = principal x rate% x days,
 * rounded to the nearest NGC. This is the only accrual formula in use
 * as of the Sept 28, 2026 migration (0.01%/day, applied to every
 * stake's own dailyRatePct from its own startedAt — see
 * app/api/admin/cutover/route.ts).
 */
export function computeSimpleProfit(principal: number, dailyRatePct: number, days: number): number {
  return Math.round(principal * (dailyRatePct / 100) * days);
}