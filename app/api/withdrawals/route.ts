import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRealWithdrawableBalance, getStakingProfitBalance, debitWithCheck } from "@/lib/ledger";
import { getCurrentUser } from "@/lib/auth";
import { LedgerType } from "@prisma/client";
import { DepositAsset } from "@/lib/solanaConfig";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { usdtAmount, asset, network, walletAddress, source } = await req.json();
  const withdrawAsset: DepositAsset = asset === "SOL" || asset === "NGOAT" ? asset : "USDT";
  if (!usdtAmount || !network || !walletAddress) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }
  // "real" = ordinary spendable balance (deposits, winnings, matured
  // stake principal). "staking_profit" = profit released from matured
  // stakes only — see lib/ledger.ts. Defaults to "real" so existing
  // clients that don't send this yet keep working unchanged.
  const withdrawSource: "real" | "staking_profit" = source === "staking_profit" ? "staking_profit" : "real";

  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });

  // Withdrawals are switched off until launch — flip
  // PlatformConfig.withdrawalsEnabled from the admin Settings tab
  // when ready. Existing requests already in the system (PENDING,
  // PAID, REJECTED) are unaffected; this only blocks new submissions.
  if (!config?.withdrawalsEnabled) {
    return NextResponse.json(
      { error: "WITHDRAWALS_DISABLED", message: "Withdrawals are temporarily closed until launch." },
      { status: 403 }
    );
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });

  // Neither withdrawal option lights up until the user has put real
  // money in — a lifetime total of at least withdrawalUnlockDepositCredits
  // NGC in APPROVED deposits, regardless of how much they've earned
  // otherwise (bonus, winnings, staking profit all included).
  const unlockThreshold = config?.withdrawalUnlockDepositCredits ?? 20000;
  const totalDeposited = dbUser?.totalApprovedDepositCredits ?? 0;
  if (totalDeposited < unlockThreshold) {
    return NextResponse.json(
      {
        error: "DEPOSIT_REQUIREMENT_NOT_MET",
        unlockThreshold,
        totalDeposited,
        message: `Deposit at least ${unlockThreshold.toLocaleString()} NGC to unlock withdrawals.`,
      },
      { status: 403 }
    );
  }

  const rate = config?.usdtToCreditsRate ?? 2000;
  const minUsdt = config?.minWithdrawalUsdt ?? 10;
  const maxDailyUsdt = config?.maxDailyWithdrawalUsdt ?? 100;

  // NOTE: usdtAmount is (and always was) a USD-equivalent value, not
  // literally USDT — the user picks how much value they want out, and
  // `asset` says which token they want it paid in. The admin who pays
  // the request manually converts this USD amount to the current
  // market amount of `asset` at payout time.
  if (usdtAmount < minUsdt) {
    return NextResponse.json({ error: "BELOW_MIN_WITHDRAWAL", minUsdt }, { status: 400 });
  }

  // One-wallet-per-account: the first wallet a user withdraws to
  // becomes permanently linked. Every withdrawal after that must use
  // the exact same wallet. The DB's unique constraint on
  // User.walletAddress is what actually stops the same wallet being
  // linked to a second account — this is the core anti-multi-account
  // control, enforced here at withdrawal rather than at signup so the
  // free bonus stays frictionless to claim.
  if (dbUser?.walletAddress && dbUser.walletAddress !== walletAddress) {
    return NextResponse.json(
      { error: "WALLET_MISMATCH", linkedWallet: dbUser.walletAddress },
      { status: 400 }
    );
  }
  if (!dbUser?.walletAddress) {
    try {
      await prisma.user.update({ where: { id: user.id }, data: { walletAddress } });
    } catch {
      // Unique constraint hit — this wallet is already linked to a
      // different account.
      return NextResponse.json({ error: "WALLET_ALREADY_LINKED" }, { status: 400 });
    }
  }

  // Daily cap: sum today's PENDING + PAID withdrawal requests (rejected
  // ones never actually went through, so they don't count against it).
  // Applies across BOTH sources AND all assets combined — one $100/day
  // cap total, since usdtAmount is always USD-equivalent regardless of
  // which asset was picked.
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

  if (withdrawSource === "staking_profit") {
    // Staked Profit: only released profit from MATURED stakes is ever
    // withdrawable this way — this balance is naturally 0 until at
    // least one stake has matured, which is what keeps this option
    // inactive before the 6-month term ends.
    const stakingProfit = await getStakingProfitBalance(user.id);
    if (stakingProfit < creditsNeeded) {
      return NextResponse.json(
        { error: "EXCEEDS_STAKING_PROFIT_BALANCE", stakingProfit },
        { status: 400 }
      );
    }
    await debitWithCheck({
      userId: user.id,
      type: LedgerType.STAKE_PROFIT_RELEASE,
      amount: creditsNeeded,
      description: `Staked profit withdrawal: $${usdtAmount} (${withdrawAsset}) to ${network}`,
      referencePrefix: "wd",
    });
  } else {
    // Real Balance: everything else — the free signup bonus is never
    // withdrawable, and currently-available staking profit is
    // excluded here too (it must be withdrawn via "Staked Profit"
    // specifically, never lumped in).
    const withdrawable = await getRealWithdrawableBalance(user.id);
    if (withdrawable < creditsNeeded) {
      return NextResponse.json(
        { error: "EXCEEDS_WITHDRAWABLE_BALANCE", withdrawable },
        { status: 400 }
      );
    }
    await debitWithCheck({
      userId: user.id,
      type: LedgerType.REDEMPTION,
      amount: creditsNeeded,
      description: `Withdrawal request: $${usdtAmount} (${withdrawAsset}) to ${network}`,
      referencePrefix: "wd",
    });
  }

  const withdrawal = await prisma.withdrawalRequest.create({
    data: { userId: user.id, usdtAmount, asset: withdrawAsset, network, walletAddress, status: "PENDING" },
  });

  return NextResponse.json({ withdrawal });
}