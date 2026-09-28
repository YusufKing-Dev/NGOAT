import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Reads/writes live data — must never be statically pre-rendered.
export const dynamic = "force-dynamic";

/**
 * Starts a new leaderboard season: rankings reset to zero from this
 * moment on. Does NOT touch any user's NGC balance or ledger history —
 * only PlatformConfig.leaderboardResetAt, which /api/leaderboard uses
 * as its "only count entries after this" cutoff. Fully reversible by
 * clearing the field again (e.g. via Prisma Studio or a direct
 * update) if a reset is ever done by mistake.
 */
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const config = await prisma.platformConfig.upsert({
    where: { id: "singleton" },
    update: { leaderboardResetAt: new Date() },
    create: { id: "singleton", leaderboardResetAt: new Date() },
  });

  return NextResponse.json({ ok: true, leaderboardResetAt: config.leaderboardResetAt });
}