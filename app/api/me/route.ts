import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBalance } from "@/lib/ledger";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const [dbUser, balance, recent, predictions] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id } }),
    getBalance(user.id),
    prisma.ledgerEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.prediction.findMany({ where: { userId: user.id } }),
  ]);

  const wins = predictions.filter((p) => p.status === "WON").length;
  const losses = predictions.filter((p) => p.status === "LOST").length;
  const total = predictions.length;

  return NextResponse.json({
    balance,
    wageringRequired: dbUser?.bonusWageringRequired ?? 0,
    wageringProgress: dbUser?.bonusWageringProgress ?? 0,
    stats: {
      total,
      wins,
      losses,
      winPct: total ? Math.round((wins / total) * 100) : 0,
    },
    recent,
  });
}
