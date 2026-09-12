import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { enterNumberPick, getOrCreateCurrentDraw } from "@/lib/games";

// Reads/writes live data — must never be statically pre-rendered.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const [config, draw] = await Promise.all([
    prisma.platformConfig.findUnique({ where: { id: "singleton" } }),
    getOrCreateCurrentDraw(),
  ]);

  const myEntry = await prisma.numberPickEntry.findUnique({
    where: { userId_drawId: { userId: user.id, drawId: draw.id } },
  });

  const recentDraws = await prisma.numberPickDraw.findMany({
    where: { settled: true },
    orderBy: { weekStart: "desc" },
    take: 5,
    include: {
      entries: { where: { userId: user.id } },
    },
  });

  return NextResponse.json({
    enabled: !!(config?.gamesEnabled && config?.numberPickEnabled),
    minStake: config?.numberPickMinStake ?? 10000,
    rangeMax: config?.numberPickRangeMax ?? 50,
    rewardMultiplier: config?.numberPickRewardMultiplier ?? 1.8,
    currentDraw: { id: draw.id, weekStart: draw.weekStart, drawAt: draw.drawAt },
    myEntryThisWeek: myEntry,
    recentResults: recentDraws.map((d) => ({
      weekStart: d.weekStart,
      winningNumber: d.winningNumber,
      myEntry: d.entries[0] ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { number, stake } = await req.json().catch(() => ({}));
  if (typeof number !== "number" || typeof stake !== "number") {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  try {
    const entry = await enterNumberPick(user.id, number, stake);
    return NextResponse.json({ ok: true, entry });
  } catch (e: any) {
    const code =
      e.message === "INSUFFICIENT_BALANCE" ||
      e.message === "INVALID_NUMBER" ||
      e.message === "BELOW_MIN_STAKE" ||
      e.message === "ALREADY_ENTERED_THIS_WEEK"
        ? 400
        : e.message === "GAME_DISABLED"
        ? 403
        : 500;
    return NextResponse.json({ error: e.message ?? "ENTRY_FAILED" }, { status: code });
  }
}