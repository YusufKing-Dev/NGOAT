import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const rewardEntries = await prisma.ledgerEntry.groupBy({
    by: ["userId"],
    where: { type: "PREDICTION_REWARD" },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const userIds = rewardEntries.map((e) => e.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true },
  });
  const usernameById = Object.fromEntries(users.map((u) => [u.id, u.username]));

  const leaderboard = rewardEntries
    .map((e) => ({
      username: usernameById[e.userId] ?? "unknown",
      points: e._sum.amount ?? 0,
      wins: e._count._all,
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 20);

  return NextResponse.json({ leaderboard });
}
