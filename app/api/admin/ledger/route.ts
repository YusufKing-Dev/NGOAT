import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Reads live data — must never be statically pre-rendered.
export const dynamic = "force-dynamic";

// Every single ledger entry ever written — signup bonuses, deposits,
// prediction stakes/rewards, redemptions, admin adjustments, refunds,
// stake locks/releases, referral bonuses. This is the full audit
// trail of "anything people do" on the platform, across all users.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || undefined;
  const type = searchParams.get("type") || undefined;

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(type ? { type: type as any } : {}),
    },
    include: { user: { select: { username: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return NextResponse.json({ entries });
}