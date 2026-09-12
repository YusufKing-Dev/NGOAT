import { randomInt } from "crypto";
import { prisma } from "./prisma";
import { addLedgerEntry, debitWithCheck } from "./ledger";
import { LedgerType, PredictionStatus } from "@prisma/client";

// ---------------------------------------------------------------
// Spin the Wheel
// ---------------------------------------------------------------

/**
 * Segment odds and payout, as agreed in the platform proposal. Payout
 * is the segment's NGC value PLUS the stake returned — e.g. landing
 * on 2000 pays 3000 total. The 0 segment pays nothing (full loss);
 * the Bonus segment pays nothing but grants one free respin.
 *
 * Odds sum to 100. Not admin-editable yet — these are the numbers
 * that were priced out for a sustainable house edge (~19%); exposing
 * them for editing without re-checking the payout math each time
 * risks quietly turning this into a losing game for the platform.
 */
const SPIN_SEGMENTS: { label: string; odds: number; value: number; isBonus?: boolean }[] = [
  { label: "0", odds: 35, value: 0 },
  { label: "10", odds: 20, value: 10 },
  { label: "5", odds: 15, value: 5 },
  { label: "2", odds: 13, value: 2 },
  { label: "500", odds: 9, value: 500 },
  { label: "1000", odds: 4, value: 1000 },
  { label: "2000", odds: 2.5, value: 2000 },
  { label: "5000", odds: 0.5, value: 5000 },
  { label: "BONUS", odds: 1, value: 0, isBonus: true },
];

/** Picks a segment using crypto-secure randomness, weighted by `odds`. */
function drawSpinSegment() {
  // Work in tenths of a percent (1000 total) so the 0.5% segment is exact.
  const roll = randomInt(0, 1000);
  let cumulative = 0;
  for (const seg of SPIN_SEGMENTS) {
    cumulative += seg.odds * 10;
    if (roll < cumulative) return seg;
  }
  return SPIN_SEGMENTS[0]; // unreachable in practice; safe fallback
}

/**
 * Plays one spin. Whether this spin is free is decided HERE from the
 * user's server-tracked freeSpinsAvailable counter — never trust a
 * client-supplied "this is a free spin" flag, or anyone could claim
 * free spins they never earned.
 */
export async function playSpin(userId: string) {
  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  if (!config?.gamesEnabled || !config?.spinEnabled) {
    throw new Error("GAME_DISABLED");
  }
  const cost = config.spinCostNgc ?? 1000;

  // Atomically check-and-consume a free spin if one's available, so
  // two concurrent requests can't both consume the same single credit.
  const isFreeSpin = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (user && user.freeSpinsAvailable > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { freeSpinsAvailable: { decrement: 1 } },
      });
      return true;
    }
    return false;
  });

  if (!isFreeSpin) {
    await debitWithCheck({
      userId,
      type: LedgerType.SPIN_COST,
      amount: cost,
      description: "Spin the Wheel",
      referencePrefix: "spin",
    });
  }

  const segment = drawSpinSegment();
  const payout = segment.isBonus ? 0 : segment.value === 0 ? 0 : segment.value + (isFreeSpin ? 0 : cost);

  if (payout > 0) {
    await addLedgerEntry({
      userId,
      type: LedgerType.SPIN_PAYOUT,
      amount: payout,
      description: `Spin the Wheel: landed ${segment.label}`,
      referencePrefix: "spinpay",
    });
  }

  if (segment.isBonus) {
    await prisma.user.update({
      where: { id: userId },
      data: { freeSpinsAvailable: { increment: 1 } },
    });
  }

  const play = await prisma.spinPlay.create({
    data: {
      userId,
      cost: isFreeSpin ? 0 : cost,
      segmentLabel: segment.label,
      payout,
      isBonusSpin: isFreeSpin,
    },
  });

  return { segment: segment.label, payout, grantsFreeSpin: !!segment.isBonus, wasFreeSpin: isFreeSpin, play };
}

// ---------------------------------------------------------------
// Number Pick
// ---------------------------------------------------------------

/**
 * The Monday (00:00 UTC) that starts the current draw week. Draws are
 * identified by this date, so "this week's draw" always resolves to
 * the same row regardless of which day someone plays on.
 */
function currentWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday));
  return monday;
}

/** Gets this week's draw, creating it if it doesn't exist yet. */
export async function getOrCreateCurrentDraw() {
  const weekStart = currentWeekStart();
  const drawAt = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000); // following Monday 00:00 UTC

  return prisma.numberPickDraw.upsert({
    where: { weekStart },
    update: {},
    create: { weekStart, drawAt },
  });
}

/** Enters this week's draw with a single number and stake. */
export async function enterNumberPick(userId: string, number: number, stake: number) {
  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  if (!config?.gamesEnabled || !config?.numberPickEnabled) {
    throw new Error("GAME_DISABLED");
  }

  const minStake = config.numberPickMinStake ?? 10000;
  const rangeMax = config.numberPickRangeMax ?? 50;

  if (!Number.isInteger(number) || number < 1 || number > rangeMax) {
    throw new Error("INVALID_NUMBER");
  }
  if (stake < minStake) {
    throw new Error("BELOW_MIN_STAKE");
  }

  const draw = await getOrCreateCurrentDraw();
  if (draw.settled) {
    throw new Error("DRAW_ALREADY_SETTLED");
  }

  const existing = await prisma.numberPickEntry.findUnique({
    where: { userId_drawId: { userId, drawId: draw.id } },
  });
  if (existing) {
    throw new Error("ALREADY_ENTERED_THIS_WEEK");
  }

  await debitWithCheck({
    userId,
    type: LedgerType.NUMBER_PICK_STAKE,
    amount: stake,
    description: `Number Pick: picked ${number} for the week of ${draw.weekStart.toDateString()}`,
    referencePrefix: "nps",
  });

  return prisma.numberPickEntry.create({
    data: { userId, drawId: draw.id, number, stake },
  });
}

/**
 * Settles the given draw: draws the winning number, pays out any
 * matching entries using the SAME additive payout formula as football
 * predictions (reward = stake x (1 + multiplier)), and marks every
 * entry WON or LOST. Safe to call more than once — a draw that's
 * already settled is a no-op.
 */
export async function settleNumberPickDraw(drawId: string) {
  const draw = await prisma.numberPickDraw.findUnique({ where: { id: drawId } });
  if (!draw || draw.settled) return { skipped: true };

  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const rangeMax = config?.numberPickRangeMax ?? 50;
  const multiplier = config?.numberPickRewardMultiplier ?? 1.8;

  const winningNumber = randomInt(1, rangeMax + 1);

  const entries = await prisma.numberPickEntry.findMany({ where: { drawId } });

  for (const entry of entries) {
    if (entry.number === winningNumber) {
      const payout = Math.round(entry.stake * (1 + multiplier));
      await addLedgerEntry({
        userId: entry.userId,
        type: LedgerType.NUMBER_PICK_PAYOUT,
        amount: payout,
        description: `Number Pick: won with number ${winningNumber}`,
        referencePrefix: "nppay",
      });
      await prisma.numberPickEntry.update({
        where: { id: entry.id },
        data: { status: PredictionStatus.WON, payout },
      });
    } else {
      await prisma.numberPickEntry.update({
        where: { id: entry.id },
        data: { status: PredictionStatus.LOST },
      });
    }
  }

  await prisma.numberPickDraw.update({
    where: { id: drawId },
    data: { winningNumber, settled: true },
  });

  return { skipped: false, winningNumber, entriesSettled: entries.length };
}