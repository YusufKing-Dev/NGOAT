import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Reads live data / has side effects on every request — must never
// be statically pre-rendered at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  // Unsettled matches (UPCOMING / LOCKED) come first and are never cut
  // off by age. Finished matches (SETTLED / CANCELLED) fill the rest,
  // for a maximum of 500 matches in total.
  const LIMIT = 500;

  const open = await prisma.match.findMany({
    where: { status: { in: ["UPCOMING", "LOCKED"] } },
    orderBy: { kickoff: "desc" },
    take: LIMIT,
  });

  const done = await prisma.match.findMany({
    where: { status: { in: ["SETTLED", "CANCELLED"] } },
    orderBy: { kickoff: "desc" },
    take: Math.max(LIMIT - open.length, 0),
  });

  return NextResponse.json({ matches: [...open, ...done] });
}
