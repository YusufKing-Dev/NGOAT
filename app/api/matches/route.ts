import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Reads live data / has side effects on every request — must never
// be statically pre-rendered at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  const matches = await prisma.match.findMany({
    where: { status: "UPCOMING" },
    orderBy: { kickoff: "asc" },
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
  const minBet = config?.minBetCredits ?? 5000;
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