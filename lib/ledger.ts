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
 *
 * When type is PREDICTION_STAKE, this also advances the user's
 * bonusWageringProgress — staking is what "wagering" means here.
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
    const entry = await tx.ledgerEntry.create({
      data: {
        userId: params.userId,
        type: params.type,
        amount: -Math.abs(params.amount),
        description: params.description,
        reference,
      },
    });

    if (params.type === LedgerType.PREDICTION_STAKE) {
      await tx.user.update({
        where: { id: params.userId },
        data: { bonusWageringProgress: { increment: params.amount } },
      });
    }

    return entry;
  });
}

/**
 * Issues the one-time free signup bonus and locks it behind a wagering
 * requirement (bonus amount x multiplier must be staked before ANY
 * withdrawal is allowed — see isWithdrawalEligible). Call this once,
 * right after a new user is created.
 */
export async function issueSignupBonus(userId: string) {
  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const bonus = config?.signupBonusCredits ?? 20000;
  const multiplier = config?.bonusWageringMultiplier ?? 3;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.signupBonusIssued) {
      throw new Error("BONUS_ALREADY_ISSUED");
    }

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

    await tx.user.update({
      where: { id: userId },
      data: {
        signupBonusIssued: true,
        bonusWageringRequired: { increment: bonus * multiplier },
      },
    });
  });
}

/**
 * A user can withdraw once they've wagered (staked) at least
 * bonusWageringRequired total. Users who never took the bonus have
 * bonusWageringRequired = 0 and are always eligible. Call this before
 * creating a WithdrawalRequest.
 */
export async function isWithdrawalEligible(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  return user.bonusWageringProgress >= user.bonusWageringRequired;
}
