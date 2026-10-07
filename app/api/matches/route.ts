import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { FIXTURE_WINDOW_DAYS } from "@/lib/footballData";

// Reads live data / has side effects on every request — must never
// be statically pre-rendered at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  // Only matches kicking off within the next FIXTURE_WINDOW_DAYS days
  // are shown on the predictions page. Fixtures already imported
  // further out stay in the database untouched and simply appear
  // once they come inside the window.
  const windowEnd = new Date(Date.now() + FIXTURE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.match.findMany({
    where: { status: "UPCOMING", kickoff: { lte: windowEnd } },
    orderBy: { kickoff: "asc" },
  });
  // Only matches that have odds can be predicted. Internal model details
  // (expected goals etc.) are stripped from the public response.
  const matches = rows
    .filter((m) => m.odds)
    .map((m) => {
      const { meta, ...publicOdds } = m.odds as any;
      return {
        id: m.id,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        competition: m.competition,
        kickoff: m.kickoff,
        predictionDeadline: m.predictionDeadline,
        odds: publicOdds,
      };
    });
  return NextResponse.json({ matches });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json();
  const { homeTeam, awayTeam, competition, kickoff, predictionDeadline } = body;

  if (!homeTeam || !awayTeam || !kickoff || !predictionDeadline) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  // entryCredits/rewardCredits are legacy display fields only — stake is
  // now chosen per-prediction by the user (see /api/predictions), so
  // these just record the platform's minimum for reference. rewardCredits
  // shows the indicative payout for a 1-leg win under the additive
  // formula (stake x (1 + legs x rewardMultiplier)) — see lib/settlement.ts.
  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const minBet = config?.minBetCredits ?? 10000;
  const rewardBonusRate = config?.rewardMultiplier ?? 0.8;

  const match = await prisma.match.create({
    data: {
      homeTeam,
      awayTeam,
      competition,
      kickoff: new Date(kickoff),
      predictionDeadline: new Date(predictionDeadline),
      entryCredits: minBet,
      rewardCredits: Math.round(minBet * (1 + rewardBonusRate)),
    },
  });

  return NextResponse.json({ match });
}