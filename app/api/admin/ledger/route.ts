import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Reads live data — must never be statically pre-rendered.
export const dynamic = "force-dynamic";

// Every single ledger entry ever written — signup bonuses, deposits,
// prediction stakes/rewards, redemptions, admin adjustments, refunds,
// stake locks/releases, referral bonuses — PLUS a synthetic
// ACCOUNT_CREATED row per user. Account creation itself has no ledger
// entry (the real SIGNUP_BONUS entry only lands once the user
// verifies their email), so without this, anyone who registers but
// never verifies would be invisible here even though registering is
// itself an activity worth tracking. This is the full audit trail of
// "anything people do" on the platform, across all users.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || undefined;
  const type = searchParams.get("type") || undefined;

  const [entries, users] = await Promise.all([
    type && type !== "ACCOUNT_CREATED"
      ? prisma.ledgerEntry.findMany({
          where: { ...(userId ? { userId } : {}), type: type as any },
          include: { user: { select: { username: true, email: true } } },
          orderBy: { createdAt: "desc" },
          take: 500,
        })
      : type === "ACCOUNT_CREATED"
      ? []
      : prisma.ledgerEntry.findMany({
          where: { ...(userId ? { userId } : {}) },
          include: { user: { select: { username: true, email: true } } },
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
    type && type !== "ACCOUNT_CREATED"
      ? []
      : prisma.user.findMany({
          where: { ...(userId ? { id: userId } : {}) },
          select: { id: true, username: true, email: true, emailVerified: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
  ]);

  const signupRows = users.map((u) => ({
    id: `signup-${u.id}`,
    type: "ACCOUNT_CREATED",
    amount: 0,
    status: u.emailVerified ? "VERIFIED" : "UNVERIFIED",
    description: null,
    reference: u.id,
    createdAt: u.createdAt,
    user: { username: u.username, email: u.email },
  }));

  const combined = [...entries, ...signupRows]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 500);

  return NextResponse.json({ entries: combined });
}