import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchScheduledFixtures, DEFAULT_COMPETITIONS } from "@/lib/footballData";

function isAuthorized(req: NextRequest) {
  return req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}

// Reads live data / has side effects on every request — must never
// be statically pre-rendered at build time.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const entry = config?.minBetCredits ?? 2000;
  const reward = Math.round(entry * 1.8);

  let created = 0;
  const errors: string[] = [];

  for (const code of DEFAULT_COMPETITIONS) {
    let fixtures: any[] = [];
    try {
      fixtures = await fetchScheduledFixtures(code);
    } catch (e: any) {
      // One competition's API call failing shouldn't block the others.
      errors.push(`${code}: ${e.message}`);
      continue;
    }

    for (const f of fixtures) {
      const externalId = String(f.id);
      const existing = await prisma.match.findUnique({ where: { externalId } });
      if (existing) continue;

      const kickoff = new Date(f.utcDate);
      const predictionDeadline = new Date(kickoff.getTime() - 5 * 60 * 1000);

      await prisma.match.create({
        data: {
          externalId,
          homeTeam: f.homeTeam?.name ?? "Home",
          awayTeam: f.awayTeam?.name ?? "Away",
          competition: f.competition?.name ?? code,
          kickoff,
          predictionDeadline,
          entryCredits: entry,
          rewardCredits: reward,
          status: "UPCOMING",
        },
      });
      created++;
    }
  }

  return NextResponse.json({ ok: true, created, errors });
}