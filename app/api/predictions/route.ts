import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { debitWithCheck, addLedgerEntry } from "@/lib/ledger";
import { getCurrentUser } from "@/lib/auth";
import { isValidSelection, oddsFor, combinedOdds, type MatchOdds, type MarketKey } from "@/lib/markets";

const MAX_PICKS = 50;
const MAX_STAKE = 2_000_000_000; // ledger amounts are 32-bit integers

type IncomingPick = {
  matchId: string;
  market: MarketKey;
  selection: string;
  line?: number | null;
  odds: number;
  stake?: number; // SINGLE mode only
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Places predictions. Two modes, like a normal betslip:
 *
 *  SINGLE   - every pick has its OWN stake and is its own independent
 *             slip. A losing pick doesn't affect the others.
 *  MULTIPLE - one stake for all picks (one pick per match). Payout is
 *             stake x (1 + each pick's odds minus 1, added together) and
 *             EVERY pick must win, otherwise the stake is lost.
 *
 * Odds are always read from the server's copy of the match and locked in
 * on the prediction. If they moved since the user loaded the page, we
 * answer 409 ODDS_CHANGED with the new prices instead of placing the bet.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json();
  const mode = body.mode === "SINGLE" ? "SINGLE" : "MULTIPLE";
  const picks: IncomingPick[] = Array.isArray(body.picks) ? body.picks : [];

  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const minBet = config?.minBetCredits ?? 10000;
  const minLegs = config?.minSlipLegs ?? 2;

  if (config?.predictionsEnabled === false) {
    return NextResponse.json({ error: "PREDICTIONS_DISABLED" }, { status: 403 });
  }
  if (picks.length === 0 || picks.length > MAX_PICKS) {
    return NextResponse.json({ error: "INVALID_PICKS" }, { status: 400 });
  }

  for (const p of picks) {
    if (
      typeof p.matchId !== "string" ||
      !isValidSelection({ market: p.market, selection: p.selection, line: p.line })
    ) {
      return NextResponse.json({ error: "INVALID_PICK" }, { status: 400 });
    }
  }

  // ---- stakes ----
  let stakes: number[] = [];
  if (mode === "SINGLE") {
    stakes = picks.map((p) => Math.round(Number(p.stake)));
  } else {
    if (picks.length < minLegs) {
      return NextResponse.json({ error: "TOO_FEW_LEGS", minLegs }, { status: 400 });
    }
    const ids = picks.map((p) => p.matchId);
    if (new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: "DUPLICATE_MATCH_IN_SLIP" }, { status: 400 });
    }
    const amount = Math.round(Number(body.amount));
    stakes = [amount];
  }
  for (const s of stakes) {
    if (!Number.isFinite(s) || s <= 0 || s > MAX_STAKE) {
      return NextResponse.json({ error: "INVALID_AMOUNT" }, { status: 400 });
    }
    if (s < minBet) {
      return NextResponse.json({ error: "BELOW_MIN_STAKE", minBet }, { status: 400 });
    }
  }
  if (mode === "SINGLE") {
    const keys = picks.map((p) => `${p.matchId}|${p.market}|${p.selection}|${p.line ?? ""}`);
    if (new Set(keys).size !== keys.length) {
      return NextResponse.json({ error: "DUPLICATE_PICK" }, { status: 400 });
    }
  }
  const totalStake = stakes.reduce((a, b) => a + b, 0);
  if (totalStake > MAX_STAKE) {
    return NextResponse.json({ error: "INVALID_AMOUNT" }, { status: 400 });
  }

  // ---- matches open? odds still what the user saw? ----
  const matchIds = Array.from(new Set(picks.map((p) => p.matchId)));
  const matches = await prisma.match.findMany({ where: { id: { in: matchIds } } });
  if (matches.length !== matchIds.length) {
    return NextResponse.json({ error: "MATCH_NOT_FOUND" }, { status: 404 });
  }
  const byId = new Map(matches.map((m) => [m.id, m]));
  const now = new Date();
  for (const m of matches) {
    if (m.status !== "UPCOMING" || now > m.predictionDeadline) {
      return NextResponse.json({ error: "PREDICTIONS_CLOSED", matchId: m.id }, { status: 400 });
    }
  }

  const serverOdds: number[] = [];
  const changed: any[] = [];
  for (const p of picks) {
    const m = byId.get(p.matchId)!;
    const current = oddsFor(m.odds as unknown as MatchOdds | null, p);
    if (current == null) {
      return NextResponse.json(
        { error: "SELECTION_UNAVAILABLE", matchId: p.matchId },
        { status: 400 }
      );
    }
    serverOdds.push(current);
    if (Math.abs(Number(p.odds) - current) > 0.001) {
      changed.push({
        matchId: p.matchId,
        market: p.market,
        selection: p.selection,
        line: p.line ?? null,
        odds: current,
      });
    }
  }
  if (changed.length > 0) {
    return NextResponse.json({ error: "ODDS_CHANGED", changes: changed }, { status: 409 });
  }

  // ---- take the money ----
  try {
    await debitWithCheck({
      userId: user.id,
      type: "PREDICTION_STAKE",
      amount: totalStake,
      description:
        mode === "SINGLE"
          ? `Singles stake (${picks.length} bet${picks.length === 1 ? "" : "s"})`
          : `Multiple stake (${picks.length} picks)`,
      referencePrefix: "pred",
    });
  } catch (e: any) {
    if (e.message === "INSUFFICIENT_BALANCE") {
      return NextResponse.json({ error: "INSUFFICIENT_BALANCE" }, { status: 400 });
    }
    throw e;
  }

  // ---- create the slip(s) ----
  try {
    const legData = (p: IncomingPick, i: number, stake: number) => ({
      userId: user.id,
      matchId: p.matchId,
      market: p.market,
      selection: p.selection,
      line: p.line ?? null,
      odds: serverOdds[i],
      stake,
    });

    let slips;
    if (mode === "SINGLE") {
      slips = await prisma.$transaction(
        picks.map((p, i) =>
          prisma.predictionSlip.create({
            data: {
              userId: user.id,
              stake: stakes[i],
              oddsBased: true,
              totalOdds: serverOdds[i],
              legs: { create: [legData(p, i, stakes[i])] },
            },
            include: { legs: true },
          })
        )
      );
    } else {
      const total = r2(combinedOdds(serverOdds));
      const slip = await prisma.predictionSlip.create({
        data: {
          userId: user.id,
          stake: stakes[0],
          oddsBased: true,
          totalOdds: total,
          legs: { create: picks.map((p, i) => legData(p, i, stakes[0])) },
        },
        include: { legs: true },
      });
      slips = [slip];
    }
    return NextResponse.json({ slips });
  } catch (e: any) {
    // Slip creation failed after the stake was already taken — refund it
    // so nothing is lost.
    await addLedgerEntry({
      userId: user.id,
      type: "REFUND",
      amount: totalStake,
      description: "Refund: prediction creation failed",
      referencePrefix: "rfd",
    });
    return NextResponse.json({ error: "SLIP_CREATION_FAILED" }, { status: 400 });
  }
}