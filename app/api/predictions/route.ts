import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { debitWithCheck, addLedgerEntry } from "@/lib/ledger";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { legs, amount } = await req.json();

  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const minLegs = config?.minSlipLegs ?? 3;
  const minBet = config?.minBetCredits ?? 5000;

  if (!Array.isArray(legs) || legs.length < minLegs) {
    return NextResponse.json({ error: "TOO_FEW_LEGS", minLegs }, { status: 400 });
  }

  const matchIds = legs.map((l: any) => l.matchId);
  if (new Set(matchIds).size !== matchIds.length) {
    return NextResponse.json({ error: "DUPLICATE_MATCH_IN_SLIP" }, { status: 400 });
  }
  for (const l of legs) {
    if (!["HOME", "DRAW", "AWAY"].includes(l.pick)) {
      return NextResponse.json({ error: "INVALID_PICK" }, { status: 400 });
    }
  }

  const stake = Math.round(Number(amount));
  if (!Number.isFinite(stake) || stake <= 0) {
    return NextResponse.json({ error: "INVALID_AMOUNT" }, { status: 400 });
  }
  if (stake < minBet) {
    return NextResponse.json({ error: "BELOW_MIN_STAKE", minBet }, { status: 400 });
  }

  const matches = await prisma.match.findMany({ where: { id: { in: matchIds } } });
  if (matches.length !== matchIds.length) {
    return NextResponse.json({ error: "MATCH_NOT_FOUND" }, { status: 404 });
  }
  const now = new Date();
  for (const m of matches) {
    if (m.status !== "UPCOMING" || now > m.predictionDeadline) {
      return NextResponse.json({ error: "PREDICTIONS_CLOSED", matchId: m.id }, { status: 400 });
    }
  }

  // Already-picked check up front (the DB unique constraint also
  // enforces this, but a clean error here is better than a raw
  // constraint-violation message).
  const existing = await prisma.prediction.findMany({
    where: { userId: user.id, matchId: { in: matchIds } },
  });
  if (existing.length > 0) {
    return NextResponse.json(
      { error: "ALREADY_PREDICTED_MATCH", matchId: existing[0].matchId },
      { status: 400 }
    );
  }

  try {
    await debitWithCheck({
      userId: user.id,
      type: "PREDICTION_STAKE",
      amount: stake,
      description: `Accumulator stake (${legs.length} legs)`,
      referencePrefix: "pred",
    });
  } catch (e: any) {
    if (e.message === "INSUFFICIENT_BALANCE") {
      return NextResponse.json({ error: "INSUFFICIENT_BALANCE" }, { status: 400 });
    }
    throw e;
  }

  try {
    const slip = await prisma.predictionSlip.create({
      data: {
        userId: user.id,
        stake,
        legs: {
          create: legs.map((l: any) => ({
            userId: user.id,
            matchId: l.matchId,
            pick: l.pick,
            stake,
          })),
        },
      },
      include: { legs: true },
    });
    return NextResponse.json({ slip });
  } catch (e: any) {
    // Slip creation failed (e.g. a race on the unique-match constraint)
    // after the stake was already debited — refund it so nothing is
    // lost.
    await addLedgerEntry({
      userId: user.id,
      type: "REFUND",
      amount: stake,
      description: "Refund: slip creation failed",
      referencePrefix: "rfd",
    });
    return NextResponse.json({ error: "SLIP_CREATION_FAILED" }, { status: 400 });
  }
}