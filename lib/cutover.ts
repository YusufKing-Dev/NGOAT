import { randomUUID } from "crypto";
import { LedgerStatus, LedgerType, StakeDuration } from "@prisma/client";
import { prisma } from "./prisma";
import { DURATION_DAYS } from "./staking";

const SIX_MONTHS_MS = DURATION_DAYS.SIX_MONTHS * 24 * 60 * 60 * 1000;
const NEW_RATE = 0.01;

export type CutoverResult = {
  ok: boolean;
  dryRun: boolean;
  alreadyCompleted?: boolean;
  stakesUpdated: number;
  usersStaked: number;
  usersSkippedZero: number;
  totalNgcStaked: number;
  errors: string[];
};

/**
 * Sept 28, 2026 cutover. Safe to re-run:
 *  - each user is swept in ONE transaction (debit + stake + autoStakedAt
 *    all commit together or not at all — no lost balances)
 *  - autoStakedAt is re-checked inside the transaction (no double sweep)
 *  - balanceMigrationCompleted only flips to true if there were ZERO
 *    errors, so a partial run can simply be run again
 */
export async function runCutover(opts: { dryRun?: boolean } = {}): Promise<CutoverResult> {
  const dryRun = !!opts.dryRun;

  const config = await prisma.platformConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  const result: CutoverResult = {
    ok: true,
    dryRun,
    stakesUpdated: 0,
    usersStaked: 0,
    usersSkippedZero: 0,
    totalNgcStaked: 0,
    errors: [],
  };

  if (config.balanceMigrationCompleted) {
    return { ...result, alreadyCompleted: true };
  }

  // --- Step 1: reset existing ACTIVE stakes to 6mo / 0.01%, extending
  // from each stake's OWN original startedAt. ---
  const existing = await prisma.stake.findMany({ where: { status: "ACTIVE" } });
  for (const stake of existing) {
    try {
      if (!dryRun) {
        await prisma.stake.update({
          where: { id: stake.id },
          data: {
            duration: StakeDuration.SIX_MONTHS,
            dailyRatePct: NEW_RATE,
            maturesAt: new Date(stake.startedAt.getTime() + SIX_MONTHS_MS),
          },
        });
      }
      result.stakesUpdated++;
    } catch (e: any) {
      result.errors.push(`stake ${stake.id}: ${e.message}`);
    }
  }

  // --- Step 2: sweep each user's balance into a new 6-month stake. ---
  const users = await prisma.user.findMany({
    where: { autoStakedAt: null },
    select: { id: true },
  });

  for (const u of users) {
    try {
      if (dryRun) {
        const sum = await prisma.ledgerEntry.aggregate({
          where: { userId: u.id, status: LedgerStatus.CONFIRMED },
          _sum: { amount: true },
        });
        const bal = sum._sum.amount ?? 0;
        if (bal > 0) {
          result.usersStaked++;
          result.totalNgcStaked += bal;
        } else result.usersSkippedZero++;
        continue;
      }

      const swept = await prisma.$transaction(
        async (tx) => {
          const fresh = await tx.user.findUnique({
            where: { id: u.id },
            select: { autoStakedAt: true },
          });
          if (!fresh || fresh.autoStakedAt) return -1; // already done

          const sum = await tx.ledgerEntry.aggregate({
            where: { userId: u.id, status: LedgerStatus.CONFIRMED },
            _sum: { amount: true },
          });
          const balance = sum._sum.amount ?? 0;
          const now = new Date();

          if (balance > 0) {
            await tx.ledgerEntry.create({
              data: {
                userId: u.id,
                type: LedgerType.STAKE_LOCK,
                amount: -balance,
                description: `Auto-staked ${balance.toLocaleString()} NGC for 6 months (Sept 28, 2026 migration)`,
                reference: `stk_${randomUUID().slice(0, 12)}`,
              },
            });
            await tx.stake.create({
              data: {
                userId: u.id,
                principal: balance,
                duration: StakeDuration.SIX_MONTHS,
                dailyRatePct: NEW_RATE,
                startedAt: now,
                maturesAt: new Date(now.getTime() + SIX_MONTHS_MS),
              },
            });
          }
          await tx.user.update({ where: { id: u.id }, data: { autoStakedAt: now } });
          return balance;
        },
        { timeout: 20000 }
      );

      if (swept > 0) {
        result.usersStaked++;
        result.totalNgcStaked += swept;
      } else if (swept === 0) {
        result.usersSkippedZero++;
      }
    } catch (e: any) {
      result.errors.push(`user ${u.id}: ${e.message}`);
    }
  }

  // --- Step 3: only mark complete if everything succeeded. ---
  if (!dryRun) {
    if (result.errors.length === 0) {
      await prisma.platformConfig.update({
        where: { id: "singleton" },
        data: { balanceMigrationCompleted: true, stakingEnabled: false },
      });
    } else {
      result.ok = false; // NOT marked complete — fix errors and run again
    }
  }

  return result;
}