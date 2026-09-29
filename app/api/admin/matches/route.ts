import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Reads live data / has side effects on every request — must never
// be statically pre-rendered at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  // Always return EVERY unsettled match (UPCOMING / LOCKED), no matter
  // how old its kickoff is, so nothing that still needs settling can
  // fall off the list. Finished matches are capped at the latest 100.
  const [open, done] = await Promise.all([
    prisma.match.findMany({
      where: { status: { in: ["UPCOMING", "LOCKED"] } },
      orderBy: { kickoff: "desc" },
    }),
    prisma.match.findMany({
      where: { status: { in: ["SETTLED", "CANCELLED"] } },
      orderBy: { kickoff: "desc" },
      take: 100,
    }),
  ]);

  return NextResponse.json({ matches: [...open, ...done] });
}
