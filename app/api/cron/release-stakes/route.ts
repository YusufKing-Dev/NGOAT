import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addLedgerEntry } from "@/lib/ledger";
import { computeAccrued, DURATION_DAYS } from "@/lib/staking";
import { StakeDuration } from "@prisma/client";

function isAuthorized(req: NextRequest) {
  return req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}

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
      const releaseAmount = computeAccrued(stake.principal, stake.dailyRatePct, days);

      await addLedgerEntry({
        userId: stake.userId,
        type: "STAKE_RELEASE",
        amount: releaseAmount,
        description: `Stake matured (${stake.duration}): ${stake.principal.toLocaleString()} NGC + growth`,
        referencePrefix: "stkr",
      });

      await prisma.stake.update({
        where: { id: stake.id },
        data: { status: "RELEASED", releasedAt: new Date(), releaseAmount },
      });
      released++;
    } catch (e: any) {
      errors.push(`${stake.id}: ${e.message}`);
    }
  }

  return NextResponse.json({ ok: true, released, errors });
}