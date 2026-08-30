import { StakeDuration } from "@prisma/client";

export const DURATION_DAYS: Record<StakeDuration, number> = {
  THREE_MONTHS: 90,
  SIX_MONTHS: 182,
  ONE_YEAR: 365,
};

/** Simple daily compounding: principal x (1 + rate%)^days, rounded to the nearest NGC. */
export function computeAccrued(principal: number, dailyRatePct: number, days: number): number {
  const factor = Math.pow(1 + dailyRatePct / 100, days);
  return Math.round(principal * factor);
}