import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { playSpin } from "@/lib/games";
import { getBalance } from "@/lib/ledger";

// Reads/writes live data — must never be statically pre-rendered.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const [dbUser, recent, balance] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { freeSpinsAvailable: true } }),
    prisma.spinPlay.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    getBalance(user.id),
  ]);

  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });

  return NextResponse.json({
    balance,
    freeSpinsAvailable: dbUser?.freeSpinsAvailable ?? 0,
    spinCost: config?.spinCostNgc ?? 1000,
    enabled: !!(config?.gamesEnabled && config?.spinEnabled),
    recent,
  });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  try {
    const result = await playSpin(user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    const code =
      e.message === "INSUFFICIENT_BALANCE"
        ? 400
        : e.message === "GAME_DISABLED"
        ? 403
        : 500;
    return NextResponse.json({ error: e.message ?? "SPIN_FAILED" }, { status: code });
  }
}