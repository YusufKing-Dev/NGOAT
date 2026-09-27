import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { debitWithCheck } from "@/lib/ledger";
import { getCurrentUser } from "@/lib/auth";
import { DURATION_DAYS, computeSimpleProfit } from "@/lib/staking";
import { StakeDuration } from "@prisma/client";

// Reads live data / has side effects on every request — must never
// be statically pre-rendered at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const stakes = await prisma.stake.findMany({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
  });

  // For active stakes, add the PROFIT accrued so far (elapsed days,
  // capped at maturity) using the exact same simple-interest formula
  // the release cron uses at full term — so this preview never
  // disagrees with what actually pays out at maturity. currentValue
  // is principal + profitSoFar, shown for reference; only profitSoFar
  // is ever actually withdrawable once released (see lib/ledger.ts).
  // Already-released stakes report their real, final split.
  const withAccrued = stakes.map((s) => {
    if (s.status !== "ACTIVE") {
      const profit = s.profitAmount ?? 0;
      return { ...s, currentValue: s.releaseAmount ?? s.principal, profitSoFar: profit };
    }
    const now = new Date();
    const elapsedMs = Math.min(now.getTime(), s.maturesAt.getTime()) - s.startedAt.getTime();
    const elapsedDays = Math.max(0, elapsedMs / (24 * 60 * 60 * 1000));
    const profitSoFar = computeSimpleProfit(s.principal, s.dailyRatePct, elapsedDays);
    return { ...s, currentValue: s.principal + profitSoFar, profitSoFar };
  });

  return NextResponse.json({ stakes: withAccrued });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { amount, duration } = await req.json();
  const principal = Math.round(Number(amount));

  if (!Number.isFinite(principal) || principal <= 0) {
    return NextResponse.json({ error: "INVALID_AMOUNT" }, { status: 400 });
  }
  if (!Object.keys(DURATION_DAYS).includes(duration)) {
    return NextResponse.json({ error: "INVALID_DURATION" }, { status: 400 });
  }

  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const minStake = config?.stakingMinCredits ?? 40000;
  const dailyRate = config?.stakingDailyRatePct ?? 0.01;

  if (config?.stakingEnabled === false) {
    return NextResponse.json({ error: "STAKING_DISABLED" }, { status: 403 });
  }

  if (principal < minStake) {
    return NextResponse.json({ error: "BELOW_MIN_STAKE", minStake }, { status: 400 });
  }

  try {
    await debitWithCheck({
      userId: user.id,
      type: "STAKE_LOCK",
      amount: principal,
      description: `Staked ${principal.toLocaleString()} NGC (${duration})`,
      referencePrefix: "stk",
    });
  } catch (e: any) {
    if (e.message === "INSUFFICIENT_BALANCE") {
      return NextResponse.json({ error: "INSUFFICIENT_BALANCE" }, { status: 400 });
    }
    throw e;
  }

  const days = DURATION_DAYS[duration as StakeDuration];
  const maturesAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const stake = await prisma.stake.create({
    data: {
      userId: user.id,
      principal,
      duration,
      dailyRatePct: dailyRate,
      maturesAt,
    },
  });

  return NextResponse.json({ stake });
}