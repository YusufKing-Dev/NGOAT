import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBalance, getWithdrawableBalance } from "@/lib/ledger";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const [balance, withdrawable, recent, slips] = await Promise.all([
    getBalance(user.id),
    getWithdrawableBalance(user.id),
    prisma.ledgerEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    // A "prediction" from the user's point of view is a whole slip
    // (accumulator), not an individual match leg.
    prisma.predictionSlip.findMany({ where: { userId: user.id } }),
  ]);

  const wins = slips.filter((s) => s.status === "WON").length;
  const losses = slips.filter((s) => s.status === "LOST").length;
  const total = slips.length;

  return NextResponse.json({
    balance,
    withdrawableBalance: withdrawable,
    stats: {
      total,
      wins,
      losses,
      winPct: total ? Math.round((wins / total) * 100) : 0,
    },
    recent,
  });
}