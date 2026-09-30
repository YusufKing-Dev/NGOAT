import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBalance, getWithdrawableBalance, getStakingProfitBalance, getRealWithdrawableBalance } from "@/lib/ledger";
import { computeSimpleProfit } from "@/lib/staking";
import { getCurrentUser } from "@/lib/auth";

// Reads live data / has side effects on every request — must never
// be statically pre-rendered at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const [dbUser, balance, withdrawable, realWithdrawable, stakingProfitBalance, activeStakes, recent, slips, referralCount, config] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: user.id } }),
      getBalance(user.id),
      getWithdrawableBalance(user.id),
      getRealWithdrawableBalance(user.id),
      getStakingProfitBalance(user.id),
      prisma.stake.findMany({ where: { userId: user.id, status: "ACTIVE" } }),
      prisma.ledgerEntry.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      // A "prediction" from the user's point of view is a whole slip
      // (accumulator), not an individual match leg.
      prisma.predictionSlip.findMany({ where: { userId: user.id } }),
      prisma.user.count({ where: { referredByUserId: user.id, referralBonusPaid: true } }),
      prisma.platformConfig.findUnique({ where: { id: "singleton" } }),
    ]);

  const wins = slips.filter((s) => s.status === "WON").length;
  const losses = slips.filter((s) => s.status === "LOST").length;
  const total = slips.length;

  // Live daily-accruing staking summary: principal still locked across
  // every active stake, plus profit accrued so far on all of them
  // (simple interest, same formula the release cron uses at maturity).
  const now = new Date();
  let stakedAmount = 0;
  let stakedProfitAccruing = 0;
  for (const s of activeStakes) {
    stakedAmount += s.principal;
    const elapsedMs = Math.min(now.getTime(), s.maturesAt.getTime()) - s.startedAt.getTime();
    const elapsedDays = Math.max(0, elapsedMs / (24 * 60 * 60 * 1000));
    stakedProfitAccruing += computeSimpleProfit(s.principal, s.dailyRatePct, elapsedDays);
  }

  const unlockThreshold = config?.withdrawalUnlockDepositCredits ?? 20000;
  const totalDeposited = dbUser?.totalApprovedDepositCredits ?? 0;

  return NextResponse.json({
    balance,
    withdrawableBalance: withdrawable,
    realWithdrawableBalance: realWithdrawable,
    staking: {
      stakedAmount, // still locked, across all active stakes
      profitAccruing: stakedProfitAccruing, // locked profit accruing daily, not yet withdrawable
      profitAvailable: stakingProfitBalance, // released from MATURED stakes — this IS withdrawable
    },
    withdrawalUnlock: {
      threshold: unlockThreshold,
      totalDeposited,
      met: totalDeposited >= unlockThreshold,
    },
    stats: {
      total,
      wins,
      losses,
      winPct: total ? Math.round((wins / total) * 100) : 0,
    },
    recent,
    referralCode: dbUser?.referralCode ?? null,
    referralCount,
    walletAddress: dbUser?.walletAddress ?? null,
    id: user.id,
    withdrawalsHeldUntil: dbUser?.withdrawalsHeldUntil ?? null,
  });
}