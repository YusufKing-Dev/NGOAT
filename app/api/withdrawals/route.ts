import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWithdrawableBalance, debitWithCheck } from "@/lib/ledger";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { usdtAmount, network, walletAddress } = await req.json();
  if (!usdtAmount || !network || !walletAddress) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const rate = config?.usdtToCreditsRate ?? 2000;
  const minUsdt = config?.minWithdrawalUsdt ?? 5;
  const maxDailyUsdt = config?.maxDailyWithdrawalUsdt ?? 100;

  if (usdtAmount < minUsdt) {
    return NextResponse.json({ error: "BELOW_MIN_WITHDRAWAL", minUsdt }, { status: 400 });
  }

  // Daily cap: sum today's PENDING + PAID withdrawal requests (rejected
  // ones never actually went through, so they don't count against it).
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todaysWithdrawals = await prisma.withdrawalRequest.aggregate({
    where: {
      userId: user.id,
      status: { in: ["PENDING", "PAID"] },
      createdAt: { gte: startOfDay },
    },
    _sum: { usdtAmount: true },
  });
  const usedToday = todaysWithdrawals._sum.usdtAmount ?? 0;
  if (usedToday + usdtAmount > maxDailyUsdt) {
    return NextResponse.json(
      {
        error: "DAILY_LIMIT_EXCEEDED",
        maxDailyUsdt,
        remainingToday: Math.max(maxDailyUsdt - usedToday, 0),
      },
      { status: 400 }
    );
  }

  const creditsNeeded = Math.round(usdtAmount * rate);

  // The free signup bonus is never withdrawable — only balance ON TOP
  // of it (deposits, prediction winnings, staking payouts) is eligible.
  // This is now the ONLY balance-based restriction on withdrawals.
  const withdrawable = await getWithdrawableBalance(user.id);
  if (withdrawable < creditsNeeded) {
    return NextResponse.json(
      { error: "EXCEEDS_WITHDRAWABLE_BALANCE", withdrawable },
      { status: 400 }
    );
  }

  await debitWithCheck({
    userId: user.id,
    type: "REDEMPTION",
    amount: creditsNeeded,
    description: `Withdrawal request: ${usdtAmount} USDT to ${network}`,
    referencePrefix: "wd",
  });

  const withdrawal = await prisma.withdrawalRequest.create({
    data: { userId: user.id, usdtAmount, network, walletAddress, status: "PENDING" },
  });

  return NextResponse.json({ withdrawal });
}