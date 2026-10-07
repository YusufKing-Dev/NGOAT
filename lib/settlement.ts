import { prisma } from "./prisma";
import { addLedgerEntry } from "./ledger";
import { PredictionStatus } from "@prisma/client";
import { gradeSelection, slipPayout, type MarketKey } from "./markets";

/**
 * Re-evaluates a slip after one of its legs changes. Called after every
 * leg update from settleMatch/cancelMatch — a slip may span matches that
 * finish at different times, so it can take several calls before a slip
 * actually resolves.
 *
 * Rules:
 * - Any leg LOST -> whole slip LOST, no payout (accumulator: one loss
 *   loses the slip).
 * - Any leg still PENDING -> wait, do nothing yet.
 * - Otherwise every leg is WON or VOID:
 *     - If every leg is VOID (all matches in the slip got cancelled),
 *       refund the full stake — there was never a valid bet left.
 *     - Otherwise, reward = stake x (1 + wonLegs x rewardBonusRate).
 *       This is ADDITIVE, not compounding: each correct leg adds a flat
 *       rewardBonusRate (e.g. 0.8 = +80% of stake) on top of the
 *       original stake, rather than multiplying the running total.
 *       That keeps growth linear in the number of legs instead of
 *       exponential — a deliberate choice after an early exponential
 *       version (stake x multiplier^legs) produced payouts far larger
 *       than intended on 4+ leg slips. VOID legs are dropped from the
 *       requirement AND from the leg count, same as before.
 */
export async function checkSlipCompletion(slipId: string) {
  const slip = await prisma.predictionSlip.findUnique({
    where: { id: slipId },
    include: { legs: true },
  });
  if (!slip || slip.status !== "PENDING") return;

  if (slip.legs.some((l) => l.status === "LOST")) {
    await prisma.predictionSlip.update({ where: { id: slip.id }, data: { status: "LOST" } });
    return;
  }
  if (slip.legs.some((l) => l.status === "PENDING")) return;

  const wonLegs = slip.legs.filter((l) => l.status === "WON").length;

  // ---- Odds-based slips (Single / Multiple) ----
  // payout = stake x product of the odds of the winning legs. VOID legs
  // (cancelled matches) are dropped, i.e. count as odds 1.00. A slip
  // where every leg was voided gets its stake back.
  if (slip.oddsBased) {
    if (wonLegs === 0) {
      await addLedgerEntry({
        userId: slip.userId,
        type: "REFUND",
        amount: slip.stake,
        description: "Refund: all matches in slip cancelled",
        referencePrefix: "rfd",
      });
      await prisma.predictionSlip.update({ where: { id: slip.id }, data: { status: "VOID" } });
      return;
    }
    const winningOdds = slip.legs
      .filter((l) => l.status === "WON")
      .map((l) => l.odds ?? 1);
    const reward = slipPayout(slip.stake, winningOdds);
    await addLedgerEntry({
      userId: slip.userId,
      type: "PREDICTION_REWARD",
      amount: reward,
      description:
        slip.legs.length === 1 ? "Prediction win" : `Multiple win (${wonLegs} picks)`,
      referencePrefix: "rwd",
    });
    await prisma.predictionSlip.update({
      where: { id: slip.id },
      data: { status: "WON", reward },
    });
    return;
  }

  // ---- Legacy slips (placed before odds existed): flat bonus formula ----

  if (wonLegs === 0) {
    // Every leg voided — nothing left to grade. Refund the stake.
    await addLedgerEntry({
      userId: slip.userId,
      type: "REFUND",
      amount: slip.stake,
      description: "Refund: all matches in slip cancelled",
      referencePrefix: "rfd",
    });
    await prisma.predictionSlip.update({ where: { id: slip.id }, data: { status: "VOID" } });
    return;
  }

  // NOTE: this field is still named `rewardMultiplier` in the database
  // (see PlatformConfig in schema.prisma) to avoid a migration, but as
  // of this change it's used as an ADDITIVE per-leg bonus rate, not an
  // exponential multiplier. Default 0.8 = each won leg adds +80% of
  // the original stake.
  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const bonusRate = config?.rewardMultiplier ?? 0.8;
  const reward = Math.round(slip.stake * (1 + wonLegs * bonusRate));

  await addLedgerEntry({
    userId: slip.userId,
    type: "PREDICTION_REWARD",
    amount: reward,
    description: `Accumulator win (${wonLegs} legs)`,
    referencePrefix: "rwd",
  });
  await prisma.predictionSlip.update({
    where: { id: slip.id },
    data: { status: "WON", reward },
  });
}

/**
 * Settles a match: resolves every leg (Prediction) tied to it against
 * the final score, then re-checks every slip those legs belong to.
 * Used both by the admin "Settle" button (auto: false) and the
 * automated results-polling cron (auto: true).
 */
export async function settleMatch(
  matchId: string,
  finalHomeScore: number,
  finalAwayScore: number,
  opts?: { auto?: boolean }
) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { predictions: true },
  });
  if (!match) throw new Error("MATCH_NOT_FOUND");
  if (match.status === "SETTLED" || match.status === "CANCELLED") {
    throw new Error("ALREADY_FINALIZED");
  }

  const outcome =
    finalHomeScore > finalAwayScore ? "HOME" : finalHomeScore < finalAwayScore ? "AWAY" : "DRAW";

  const affectedSlipIds = new Set<string>();

  for (const leg of match.predictions) {
    // Old legs only have `pick` (1X2); new legs carry market + selection.
    const result = gradeSelection(
      {
        market: (leg.market as MarketKey) ?? "1X2",
        selection: leg.selection ?? leg.pick ?? "",
        line: leg.line,
      },
      finalHomeScore,
      finalAwayScore
    );
    await prisma.prediction.update({
      where: { id: leg.id },
      data: { status: result === "WON" ? PredictionStatus.WON : PredictionStatus.LOST },
    });
    affectedSlipIds.add(leg.slipId);
  }

  await prisma.match.update({
    where: { id: match.id },
    data: {
      status: "SETTLED",
      finalHomeScore,
      finalAwayScore,
      autoSettled: !!opts?.auto,
    },
  });

  for (const slipId of affectedSlipIds) {
    await checkSlipCompletion(slipId);
  }

  return { outcome, legsResolved: match.predictions.length, slipsChecked: affectedSlipIds.size };
}

/**
 * Cancels a match (postponed/abandoned per the data provider). Every
 * leg on this match becomes VOID; slips containing it get re-checked —
 * a void leg is dropped from the slip rather than failing it outright.
 */
export async function cancelMatch(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { predictions: true },
  });
  if (!match) throw new Error("MATCH_NOT_FOUND");
  if (match.status === "SETTLED" || match.status === "CANCELLED") {
    throw new Error("ALREADY_FINALIZED");
  }

  const affectedSlipIds = new Set<string>();

  for (const leg of match.predictions) {
    await prisma.prediction.update({
      where: { id: leg.id },
      data: { status: PredictionStatus.VOID },
    });
    affectedSlipIds.add(leg.slipId);
  }

  await prisma.match.update({ where: { id: match.id }, data: { status: "CANCELLED" } });

  for (const slipId of affectedSlipIds) {
    await checkSlipCompletion(slipId);
  }

  return { voidedLegs: match.predictions.length, slipsChecked: affectedSlipIds.size };
}