import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { getBalance, debitWithCheck } from "@/lib/ledger";
import { DURATION_DAYS } from "@/lib/staking";
import { LedgerType, StakeDuration } from "@prisma/client";

// Reads/writes live data — must never be statically pre-rendered.
export const dynamic = "force-dynamic";

const SIX_MONTHS_MS = DURATION_DAYS.SIX_MONTHS * 24 * 60 * 60 * 1000;

/**
 * The Sept 28, 2026 cutover, run ONCE by an admin from the Settings
 * tab (not an unattended cron — this moves everyone's money, so it's
 * deliberately a manual, confirmed action). Idempotent via
 * PlatformConfig.balanceMigrationCompleted: a second call is a no-op
 * and just reports what already happened.
 *
 * What it does:
 *   1. Every ACTIVE stake that already existed gets reset to
 *      SIX_MONTHS / 0.01%/day, extending 6 months from its OWN
 *      original startedAt (not from today) — so a stake started 2
 *      months ago now matures in 4 months, not 6.
 *   2. Every user's current spendable balance (whatever's still in
 *      their ledger sum right now, bonus included) is swept into a
 *      brand new stake: 6 months from today, at 0.01%/day. Users with
 *      a balance of 0 are skipped — there's nothing to stake.
 *   3. stakingEnabled is flipped off, locking the Stake button —
 *      no new voluntary stakes from here on.
 */
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const config = await prisma.platformConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  if (config.balanceMigrationCompleted) {
    return NextResponse.json({ ok: true, alreadyCompleted: true });
  }

  const NEW_RATE = 0.01;

  // --- Step 1: reset every existing ACTIVE stake to 6mo/0.01%,
  // extending from its own original startedAt. ---
  const existingStakes = await prisma.stake.findMany({ where: { status: "ACTIVE" } });
  let stakesUpdated = 0;
  for (const stake of existingStakes) {
    const newMaturesAt = new Date(stake.startedAt.getTime() + SIX_MONTHS_MS);
    await prisma.stake.update({
      where: { id: stake.id },
      data: {
        duration: StakeDuration.SIX_MONTHS,
        dailyRatePct: NEW_RATE,
        maturesAt: newMaturesAt,
      },
    });
    stakesUpdated++;
  }

  // --- Step 2: sweep every user's current balance into a new forced
  // stake, skipping anyone already swept (safe to re-run) or with
  // nothing to stake. ---
  const users = await prisma.user.findMany({
    where: { autoStakedAt: null },
    select: { id: true },
  });

  let usersStaked = 0;
  const errors: string[] = [];

  for (const u of users) {
    try {
      const balance = await getBalance(u.id);
      if (balance <= 0) {
        await prisma.user.update({ where: { id: u.id }, data: { autoStakedAt: new Date() } });
        continue;
      }

      await debitWithCheck({
        userId: u.id,
        type: LedgerType.STAKE_LOCK,
        amount: balance,
        description: `Auto-staked ${balance.toLocaleString()} NGC for 6 months (Sept 28, 2026 migration)`,
        referencePrefix: "stk",
      });

      const now = new Date();
      await prisma.stake.create({
        data: {
          userId: u.id,
          principal: balance,
          duration: StakeDuration.SIX_MONTHS,
          dailyRatePct: NEW_RATE,
          startedAt: now,
          maturesAt: new Date(now.getTime() + SIX_MONTHS_MS),
        },
      });

      await prisma.user.update({ where: { id: u.id }, data: { autoStakedAt: now } });
      usersStaked++;
    } catch (e: any) {
      errors.push(`${u.id}: ${e.message}`);
    }
  }

  // --- Step 3: lock the Stake button; mark migration done. ---
  await prisma.platformConfig.update({
    where: { id: "singleton" },
    data: { balanceMigrationCompleted: true, stakingEnabled: false },
  });

  return NextResponse.json({ ok: true, stakesUpdated, usersStaked, errors });
}