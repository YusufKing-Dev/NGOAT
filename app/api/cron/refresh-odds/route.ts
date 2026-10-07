import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_COMPETITIONS } from "@/lib/footballData";
import { refreshOddsForCompetition } from "@/lib/oddsEngine";

function isAuthorized(req: NextRequest) {
  return req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}

export const dynamic = "force-dynamic";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Regenerates odds from the league tables.
 *   GET /api/cron/refresh-odds?comp=PL   -> one competition (preferred: one
 *                                           quick call, safe on short
 *                                           serverless timeouts)
 *   GET /api/cron/refresh-odds           -> all competitions, ~7s apart to
 *                                           respect football-data.org's
 *                                           10 requests/minute limit
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const comp = req.nextUrl.searchParams.get("comp");
  const codes = comp ? [comp] : DEFAULT_COMPETITIONS;
  if (comp && !DEFAULT_COMPETITIONS.includes(comp)) {
    return NextResponse.json({ error: "UNKNOWN_COMPETITION" }, { status: 400 });
  }

  const results: any[] = [];
  const errors: string[] = [];
  for (let i = 0; i < codes.length; i++) {
    try {
      results.push(await refreshOddsForCompetition(codes[i]));
    } catch (e: any) {
      errors.push(`${codes[i]}: ${e.message}`);
    }
    if (i < codes.length - 1) await sleep(7000);
  }
  return NextResponse.json({ ok: true, results, errors });
}