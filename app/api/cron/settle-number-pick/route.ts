import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { settleNumberPickDraw } from "@/lib/games";

function isAuthorized(req: NextRequest) {
  return req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}

// Reads/writes live data — must never be statically pre-rendered.
export const dynamic = "force-dynamic";

/**
 * Settles any Number Pick draw whose reveal time has passed and
 * hasn't been settled yet. Runs daily rather than exactly once a
 * week so a missed run (deploy hiccup, etc.) still catches up the
 * next day instead of silently skipping a whole week.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const dueDraws = await prisma.numberPickDraw.findMany({
    where: { settled: false, drawAt: { lte: new Date() } },
  });

  const results = [];
  for (const draw of dueDraws) {
    try {
      const result = await settleNumberPickDraw(draw.id);
      results.push({ drawId: draw.id, weekStart: draw.weekStart, ...result });
    } catch (e: any) {
      results.push({ drawId: draw.id, weekStart: draw.weekStart, error: e.message });
    }
  }

  return NextResponse.json({ ok: true, checked: dueDraws.length, results });
}