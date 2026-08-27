import { prisma } from "./prisma";
import { addLedgerEntry } from "./ledger";

/**
 * Settles a match: resolves every prediction against the final score and
 * pays winners via the ledger. Used both by the admin "Settle" button
 * (auto: false) and by the automated results-polling cron (auto: true).
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

  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const rewardMultiplier = config?.rewardMultiplier ?? 1.8;

  for (const prediction of match.predictions) {
    const won = prediction.pick === outcome;
    await prisma.prediction.update({
      where: { id: prediction.id },
      data: { status: won ? "WON" : "LOST" },
    });
    if (won) {
      // Reward scales with what this user actually staked, not a flat
      // per-match amount — otherwise a 5,000 NGC stake and a 50,000 NGC
      // stake would pay the same, which isn't fair to bigger stakers.
      const reward = Math.round(prediction.stake * rewardMultiplier);
      await addLedgerEntry({
        userId: prediction.userId,
        type: "PREDICTION_REWARD",
        amount: reward,
        description: `Reward: ${match.homeTeam} vs ${match.awayTeam}`,
        referencePrefix: "rwd",
      });
    }
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

  return { outcome, settledCount: match.predictions.length };
}

/**
 * Cancels a match (postponed/abandoned per the data provider) and refunds
 * every stake. Never silently loses user funds when a real-world match
 * doesn't happen as scheduled.
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

  for (const prediction of match.predictions) {
    await prisma.prediction.update({
      where: { id: prediction.id },
      data: { status: "VOID" },
    });
    await addLedgerEntry({
      userId: prediction.userId,
      type: "REFUND",
      amount: prediction.stake,
      description: `Refund (match cancelled): ${match.homeTeam} vs ${match.awayTeam}`,
      referencePrefix: "rfd",
    });
  }

  await prisma.match.update({ where: { id: match.id }, data: { status: "CANCELLED" } });

  return { refundedCount: match.predictions.length };
}