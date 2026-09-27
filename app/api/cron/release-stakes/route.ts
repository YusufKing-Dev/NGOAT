import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addLedgerEntry } from "@/lib/ledger";
import { computeSimpleProfit, DURATION_DAYS } from "@/lib/staking";
import { LedgerType, StakeDuration } from "@prisma/client";

function isAuthorized(req: NextRequest) {
  return req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}

// Reads live data / has side effects on every request — must never
// be statically pre-rendered at build time.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const matured = await prisma.stake.findMany({
    where: { status: "ACTIVE", maturesAt: { lte: new Date() } },
  });

  let released = 0;
  const errors: string[] = [];

  for (const stake of matured) {
    try {
      const days = DURATION_DAYS[stake.duration as StakeDuration];
      const profit = computeSimpleProfit(stake.principal, stake.dailyRatePct, days);
      const releaseAmount = stake.principal + profit;

      // Principal returns straight to normal spendable balance.
      await addLedgerEntry({
        userId: stake.userId,
        type: LedgerType.STAKE_RELEASE,
        amount: stake.principal,
        description: `Stake matured (${stake.duration}): ${stake.principal.toLocaleString()} NGC principal returned`,
        referencePrefix: "stkr",
      });

      // Profit lands in its own bucket — only withdrawable via the
      // "Staked Profit" option, never lumped into Real Balance.
      if (profit > 0) {
        await addLedgerEntry({
          userId: stake.userId,
          type: LedgerType.STAKE_PROFIT_RELEASE,
          amount: profit,
          description: `Stake matured (${stake.duration}): ${profit.toLocaleString()} NGC profit available to withdraw`,
          referencePrefix: "stkp",
        });
      }

      await prisma.stake.update({
        where: { id: stake.id },
        data: { status: "RELEASED", releasedAt: new Date(), releaseAmount, profitAmount: profit },
      });
      released++;
    } catch (e: any) {
      errors.push(`${stake.id}: ${e.message}`);
    }
  }

  return NextResponse.json({ ok: true, released, errors });
}