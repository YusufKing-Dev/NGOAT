import { prisma } from "./prisma";
import { LedgerType, LedgerStatus } from "@prisma/client";
import { randomUUID } from "crypto";

/**
 * Balance is ALWAYS derived by summing confirmed ledger entries.
 * Never read/write a `balance` column on User — that's the bug class
 * this whole design exists to prevent.
 */
export async function getBalance(userId: string): Promise<number> {
  const result = await prisma.ledgerEntry.aggregate({
    where: { userId, status: LedgerStatus.CONFIRMED },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

export async function addLedgerEntry(params: {
  userId: string;
  type: LedgerType;
  amount: number; // positive = credit, negative = debit
  description?: string;
  referencePrefix: string; // e.g. "dep", "pred", "wd", "rwd"
}) {
  const reference = `${params.referencePrefix}_${randomUUID().slice(0, 12)}`;
  return prisma.ledgerEntry.create({
    data: {
      userId: params.userId,
      type: params.type,
      amount: params.amount,
      description: params.description,
      reference,
    },
  });
}

/**
 * Debit with a balance check, wrapped in a transaction so a race
 * condition (two requests spending the same credits) can't create
 * a negative balance. Use this for anything that removes credits
 * (predictions, redemptions).
 */
export async function debitWithCheck(params: {
  userId: string;
  type: LedgerType;
  amount: number; // pass positive number; this function negates it
  description?: string;
  referencePrefix: string;
}) {
  return prisma.$transaction(async (tx) => {
    const sum = await tx.ledgerEntry.aggregate({
      where: { userId: params.userId, status: LedgerStatus.CONFIRMED },
      _sum: { amount: true },
    });
    const balance = sum._sum.amount ?? 0;
    if (balance < params.amount) {
      throw new Error("INSUFFICIENT_BALANCE");
    }
    const reference = `${params.referencePrefix}_${randomUUID().slice(0, 12)}`;
    return tx.ledgerEntry.create({
      data: {
        userId: params.userId,
        type: params.type,
        amount: -Math.abs(params.amount),
        description: params.description,
        reference,
      },
    });
  });
}

/**
 * Issues the one-time free signup bonus. Withdrawal eligibility is no
 * longer gated by a wagering requirement — the only permanent
 * restriction is bonusFloor (see getWithdrawableBalance below). Call
 * this once, right after a new user is created.
 */
export async function issueSignupBonus(userId: string) {
  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const bonus = config?.signupBonusCredits ?? 20000;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.signupBonusIssued) {
      throw new Error("BONUS_ALREADY_ISSUED");
    }

    // signupBonusCredits = 0 means the bonus is currently switched off.
    // Still mark the user as issued (no ledger noise) so nobody gets a
    // retroactive bonus if it's turned back on later.
    if (bonus > 0) {
      const reference = `bonus_${randomUUID().slice(0, 12)}`;
      await tx.ledgerEntry.create({
        data: {
          userId,
          type: LedgerType.SIGNUP_BONUS,
          amount: bonus,
          description: "Free signup bonus",
          reference,
        },
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        signupBonusIssued: true,
        // Permanent floor — this exact amount can never be withdrawn.
        bonusFloor: { increment: bonus },
      },
    });
  });
}

/**
 * The amount of a user's balance that's actually eligible to leave as
 * USDT. The original signup bonus (bonusFloor) can NEVER be withdrawn
 * — only balance above it (deposits, prediction winnings, staking
 * payouts) is ever withdrawable. This is now the ONLY withdrawal
 * restriction — there is no separate wagering-requirement gate.
 */
export async function getWithdrawableBalance(userId: string): Promise<number> {
  const [balance, user] = await Promise.all([
    getBalance(userId),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  const floor = user?.bonusFloor ?? 0;
  return Math.max(balance - floor, 0);
}

/**
 * Staking profit is its own withdrawable bucket, separate from the
 * general spendable balance — released (credited) only when a stake
 * matures (see app/api/cron/release-stakes/route.ts), and drawn down
 * by withdrawing via the "Staked Profit" option (which debits this
 * same ledger type — see /api/withdrawals). Before any stake has
 * matured this is naturally 0, which is exactly what keeps the
 * "Staked Profit" withdrawal option inactive until the 6-month term
 * actually ends — no separate maturity flag needed here.
 */
export async function getStakingProfitBalance(userId: string): Promise<number> {
  const result = await prisma.ledgerEntry.aggregate({
    where: { userId, status: LedgerStatus.CONFIRMED, type: LedgerType.STAKE_PROFIT_RELEASE },
    _sum: { amount: true },
  });
  return Math.max(result._sum.amount ?? 0, 0);
}

/**
 * "Real Balance" for withdrawal purposes: everything withdrawable
 * EXCEPT currently-available staking profit, which must be withdrawn
 * specifically via the "Staked Profit" option instead (so the same
 * NGC is never offered under both choices at once).
 */
export async function getRealWithdrawableBalance(userId: string): Promise<number> {
  const [withdrawable, stakingProfit] = await Promise.all([
    getWithdrawableBalance(userId),
    getStakingProfitBalance(userId),
  ]);
  return Math.max(withdrawable - stakingProfit, 0);
}

/**
 * Call once, right after a deposit is approved (manual admin approve
 * OR the on-chain auto-verified flow — both call this). Two things
 * happen on a user's FIRST approved deposit:
 *   1. Their running lifetime-deposit total goes up — this is what
 *      unlocks the withdrawal buttons once it crosses
 *      PlatformConfig.withdrawalUnlockDepositCredits.
 *   2. If they were referred and the referrer hasn't been paid yet,
 *      the referral bonus is paid NOW (not at signup/verification —
 *      this stops referral-bonus farming via accounts that never put
 *      real money in).
 */
export async function onDepositApproved(userId: string, creditsIssued: number) {
  await prisma.user.update({
    where: { id: userId },
    data: { totalApprovedDepositCredits: { increment: creditsIssued } },
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.referredByUserId && !user.referralBonusPaid) {
    const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
    const bonus = config?.referralBonusCredits ?? 2000;

    await addLedgerEntry({
      userId: user.referredByUserId,
      type: LedgerType.REFERRAL_BONUS,
      amount: bonus,
      description: "Referral bonus — referred user made their first deposit",
      referencePrefix: "ref",
    });
    await prisma.user.update({
      where: { id: userId },
      data: { referralBonusPaid: true },
    });
  }
                             }
