import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { getOrCreateCurrentDraw } from "@/lib/games";

// Reads live data / has a side effect (creates this week's draw row
// if it doesn't exist yet) on every request — must never be
// statically pre-rendered.
export const dynamic = "force-dynamic";

/**
 * Lists Number Pick draws, most recent first, with each draw's
 * winning numbers (once settled) and entry count — so the current
 * week's numbers can be found and announced as soon as the daily
 * settlement cron reveals them, without digging through the DB.
 *
 * Also makes sure the current week's draw row exists yet, the same
 * lazy-create the entry flow uses, so "this week" always shows up
 * here even before anyone has entered it.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  await getOrCreateCurrentDraw();

  const draws = await prisma.numberPickDraw.findMany({
    orderBy: { weekStart: "desc" },
    take: 26, // roughly 6 months back — plenty for announcing/history
    include: {
      _count: { select: { entries: true } },
    },
  });

  const withTotals = await Promise.all(
    draws.map(async (d) => {
      const agg = await prisma.numberPickEntry.aggregate({
        where: { drawId: d.id },
        _sum: { stake: true, payout: true },
      });
      return {
        id: d.id,
        weekStart: d.weekStart,
        drawAt: d.drawAt,
        winningNumbers: d.winningNumbers,
        settled: d.settled,
        entryCount: d._count.entries,
        totalStaked: agg._sum.stake ?? 0,
        totalPaidOut: agg._sum.payout ?? 0,
      };
    })
  );

  return NextResponse.json({ draws: withTotals });
}