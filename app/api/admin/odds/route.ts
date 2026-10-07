import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { regenerateOddsForMatch } from "@/lib/oddsEngine";
import { OU_LINES, type MatchOdds } from "@/lib/markets";

export const dynamic = "force-dynamic";

function num(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 1 && n <= 1000 ? Math.round(n * 100) / 100 : undefined;
}

/**
 * Admin odds control.
 *   { action: "regenerate", matchId }        -> re-price from the model
 *   { action: "set", matchId, odds }         -> hand-set odds (auto refresh
 *                                               then leaves the match alone)
 *   { action: "auto", matchId }              -> hand the match back to the model
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json();
  const { action, matchId } = body;
  const match = await prisma.match.findUnique({ where: { id: String(matchId ?? "") } });
  if (!match) return NextResponse.json({ error: "MATCH_NOT_FOUND" }, { status: 404 });
  if (match.status !== "UPCOMING") {
    return NextResponse.json({ error: "MATCH_NOT_OPEN" }, { status: 400 });
  }

  try {
    if (action === "regenerate" || action === "auto") {
      const updated = await regenerateOddsForMatch(match.id);
      return NextResponse.json({ match: updated });
    }

    if (action === "set") {
      const o = body.odds ?? {};
      const clean: MatchOdds = {
        v: 1,
        x12: { home: num(o.x12?.home), draw: num(o.x12?.draw), away: num(o.x12?.away) },
        ou: {},
        dc: {
          homeDraw: num(o.dc?.homeDraw),
          homeAway: num(o.dc?.homeAway),
          drawAway: num(o.dc?.drawAway),
        },
        meta: { source: "manual" },
      };
      for (const line of OU_LINES) {
        const row = o.ou?.[String(line)];
        const over = num(row?.over);
        const under = num(row?.under);
        if (over != null || under != null) clean.ou[String(line)] = { over, under };
      }
      const hasAny =
        Object.values(clean.x12).some((v) => v != null) ||
        Object.keys(clean.ou).length > 0 ||
        Object.values(clean.dc).some((v) => v != null);
      if (!hasAny) return NextResponse.json({ error: "NO_VALID_ODDS" }, { status: 400 });

      const updated = await prisma.match.update({
        where: { id: match.id },
        data: { odds: clean as any, oddsManual: true, oddsUpdatedAt: new Date() },
      });
      return NextResponse.json({ match: updated });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "FAILED" }, { status: 400 });
  }

  return NextResponse.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
}