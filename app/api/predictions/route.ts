import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { debitWithCheck } from "@/lib/ledger";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { matchId, pick, amount } = await req.json();
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return NextResponse.json({ error: "MATCH_NOT_FOUND" }, { status: 404 });

  if (match.status !== "UPCOMING" || new Date() > match.predictionDeadline) {
    return NextResponse.json({ error: "PREDICTIONS_CLOSED" }, { status: 400 });
  }
  if (!["HOME", "DRAW", "AWAY"].includes(pick)) {
    return NextResponse.json({ error: "INVALID_PICK" }, { status: 400 });
  }

  const stake = Math.round(Number(amount));
  if (!Number.isFinite(stake) || stake <= 0) {
    return NextResponse.json({ error: "INVALID_AMOUNT" }, { status: 400 });
  }

  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const minBet = config?.minBetCredits ?? 5000;
  if (stake < minBet) {
    return NextResponse.json({ error: "BELOW_MIN_STAKE", minBet }, { status: 400 });
  }

  try {
    // Debit stake first (inside its own transaction, checks balance)
    await debitWithCheck({
      userId: user.id,
      type: "PREDICTION_STAKE",
      amount: stake,
      description: `Stake for ${match.homeTeam} vs ${match.awayTeam}`,
      referencePrefix: "pred",
    });
  } catch (e: any) {
    if (e.message === "INSUFFICIENT_BALANCE") {
      return NextResponse.json({ error: "INSUFFICIENT_BALANCE" }, { status: 400 });
    }
    throw e;
  }

  const prediction = await prisma.prediction.create({
    data: {
      userId: user.id,
      matchId: match.id,
      pick,
      stake,
      status: "PENDING",
    },
  });

  return NextResponse.json({ prediction });
}