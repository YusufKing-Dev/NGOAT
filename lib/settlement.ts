import { prisma } from "./prisma";
import { addLedgerEntry } from "./ledger";
import { PredictionStatus } from "@prisma/client";

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
 *     - Otherwise, reward = stake x rewardMultiplier ^ (number of WON
 *       legs). VOID legs are dropped from the requirement AND from the
 *       multiplier, same as a standard bookmaker accumulator.
 */
async function checkSlipCompletion(slipId: string) {
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

  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const multiplier = config?.rewardMultiplier ?? 1.8;
  const reward = Math.round(slip.stake * Math.pow(multiplier, wonLegs));

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
    const won = leg.pick === outcome;
    await prisma.prediction.update({
      where: { id: leg.id },
      data: { status: won ? PredictionStatus.WON : PredictionStatus.LOST },
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