import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchFixtureById } from "@/lib/footballData";
import { settleMatch, cancelMatch } from "@/lib/settlement";

function isAuthorized(req: NextRequest) {
  return req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}

const CANCELLED_STATUSES = ["POSTPONED", "SUSPENDED", "CANCELLED"];

// Reads live data / has side effects on every request — must never
// be statically pre-rendered at build time.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // Only matches WE auto-imported (externalId set) and haven't finalized,
  // whose kickoff has already passed. A match an admin created by hand
  // has no externalId and is never touched here — it always needs a
  // human to settle it.
  const pending = await prisma.match.findMany({
    where: {
      externalId: { not: null },
      status: { in: ["UPCOMING", "LOCKED"] },
      kickoff: { lt: new Date() },
    },
  });

  let settled = 0;
  let cancelled = 0;
  let stillPending = 0;
  const errors: string[] = [];

  for (const match of pending) {
    let fixture: any;
    try {
      fixture = await fetchFixtureById(match.externalId!);
    } catch (e: any) {
      errors.push(`${match.id}: ${e.message}`);
      continue;
    }

    const status = fixture.status;

    if (status === "FINISHED") {
      const home = fixture.score?.fullTime?.home;
      const away = fixture.score?.fullTime?.away;
      if (home == null || away == null) {
        stillPending++;
        continue;
      }
      try {
        await settleMatch(match.id, home, away, { auto: true });
        settled++;
      } catch (e: any) {
        errors.push(`settle ${match.id}: ${e.message}`);
      }
    } else if (CANCELLED_STATUSES.includes(status)) {
      try {
        await cancelMatch(match.id);
        cancelled++;
      } catch (e: any) {
        errors.push(`cancel ${match.id}: ${e.message}`);
      }
    } else {
      // Still in progress, or the provider hasn't updated yet — leave it
      // for the next run rather than guessing.
      stillPending++;
    }
  }

  return NextResponse.json({ ok: true, settled, cancelled, stillPending, errors });
}