import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Reads live data — must never be statically pre-rendered at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const stakes = await prisma.stake.findMany({
    include: { user: { select: { username: true, email: true } } },
    orderBy: { startedAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ stakes });
}