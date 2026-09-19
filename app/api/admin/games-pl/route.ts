import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { LedgerType, LedgerStatus } from "@prisma/client";

// Reads live data — must never be statically pre-rendered.
export const dynamic = "force-dynamic";

/**
 * Per-game profit/loss, both all-time and a daily breakdown, so it's
 * possible to see at a glance whether the platform is making money on
 * games day to day — separate from Staking, which isn't a game and
 * isn't included here.
 *
 * For every game:
 *   Total Played = everything staked/spent on it
 *   Total Win    = everything actually paid out to winners
 *   Total Loss   = Played - Win  (what players did NOT get back)
 *   Balance      = Played - Win  (same figure — what the platform kept)
 * Loss and Balance are deliberately the same number, just two labels
 * for it (confirmed with the person who spec'd this).
 */
const GAMES: { key: string; label: string; stakeType: LedgerType; payoutType: LedgerType }[] = [
  { key: "football", label: "Football Predictions", stakeType: LedgerType.PREDICTION_STAKE, payoutType: LedgerType.PREDICTION_REWARD },
  { key: "spin", label: "Spin the Wheel", stakeType: LedgerType.SPIN_COST, payoutType: LedgerType.SPIN_PAYOUT },
  { key: "numberpick", label: "Number Pick", stakeType: LedgerType.NUMBER_PICK_STAKE, payoutType: LedgerType.NUMBER_PICK_PAYOUT },
];

const DAILY_WINDOW_DAYS = 30;

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const results = await Promise.all(
    GAMES.map(async (game) => {
      const [playedAgg, wonAgg] = await Promise.all([
        prisma.ledgerEntry.aggregate({
          where: { type: game.stakeType, status: LedgerStatus.CONFIRMED },
          _sum: { amount: true },
        }),
        prisma.ledgerEntry.aggregate({
          where: { type: game.payoutType, status: LedgerStatus.CONFIRMED },
          _sum: { amount: true },
        }),
      ]);
      const played = playedAgg._sum.amount ?? 0;
      const won = wonAgg._sum.amount ?? 0;

      // Raw SQL for the daily breakdown — grouping by calendar day
      // with two conditional sums in one pass is far simpler as SQL
      // than as several round trips through Prisma's query builder.
      const daily = await prisma.$queryRawUnsafe<
        { day: Date; played: bigint | null; won: bigint | null }[]
      >(
        `
        SELECT
          date_trunc('day', "createdAt") AS day,
          SUM(CASE WHEN type = $1 THEN amount ELSE 0 END) AS played,
          SUM(CASE WHEN type = $2 THEN amount ELSE 0 END) AS won
        FROM "LedgerEntry"
        WHERE type IN ($1, $2)
          AND status = 'CONFIRMED'
          AND "createdAt" >= now() - interval '${DAILY_WINDOW_DAYS} days'
        GROUP BY day
        ORDER BY day DESC
        `,
        game.stakeType,
        game.payoutType
      );

      return {
        key: game.key,
        label: game.label,
        allTime: { played, won, loss: played - won, balance: played - won },
        daily: daily.map((d) => {
          const p = Number(d.played ?? 0);
          const w = Number(d.won ?? 0);
          return { day: d.day, played: p, won: w, loss: p - w, balance: p - w };
        }),
      };
    })
  );

  return NextResponse.json({ games: results });
}