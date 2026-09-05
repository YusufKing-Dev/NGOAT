import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Reads live data / has side effects on every request — must never
// be statically pre-rendered at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const [users, balances, slipCounts, stakeCounts] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.ledgerEntry.groupBy({ by: ["userId"], _sum: { amount: true } }),
    prisma.predictionSlip.groupBy({ by: ["userId"], _count: { _all: true } }),
    prisma.stake.groupBy({ by: ["userId"], _count: { _all: true } }),
  ]);

  const balanceByUser = Object.fromEntries(balances.map((b) => [b.userId, b._sum.amount ?? 0]));
  const slipsByUser = Object.fromEntries(slipCounts.map((s) => [s.userId, s._count._all]));
  const stakesByUser = Object.fromEntries(stakeCounts.map((s) => [s.userId, s._count._all]));

  const result = users.map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    suspended: u.suspended,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt,
    balance: balanceByUser[u.id] ?? 0,
    predictionCount: slipsByUser[u.id] ?? 0,
    stakeCount: stakesByUser[u.id] ?? 0,
    walletAddress: u.walletAddress,
  }));

  return NextResponse.json({ users: result });
}