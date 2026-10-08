/**
 * Market definitions + grading. Pure functions only (no DB / no imports)
 * so they can be shared by the API, settlement and the client UI.
 *
 * Supported markets (v1):
 *   1X2  — selection HOME | DRAW | AWAY
 *   OU   — selection OVER | UNDER, with a .5 line (0.5 ... 5.5)
 *   DC   — selection HOME_DRAW (1X) | HOME_AWAY (12) | DRAW_AWAY (X2)
 */

export type MarketKey = "1X2" | "OU" | "DC";

export const OU_LINES = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5] as const;

/** Odds snapshot stored on Match.odds (JSON). */
export type MatchOdds = {
  v: 1;
  /** a side priced under the floor is simply not offered (undefined) */
  x12: { home?: number; draw?: number; away?: number };
  /** keyed by line as a string, e.g. "2.5" */
  ou: Record<string, { over?: number; under?: number }>;
  dc: { homeDraw?: number; homeAway?: number; drawAway?: number };
  meta?: { xgHome?: number; xgAway?: number; source?: "model" | "manual" };
};

export type Selection = {
  market: MarketKey;
  selection: string;
  line?: number | null;
};

const X12 = ["HOME", "DRAW", "AWAY"];
const OU = ["OVER", "UNDER"];
const DC = ["HOME_DRAW", "HOME_AWAY", "DRAW_AWAY"];

export function isValidSelection(s: Selection): boolean {
  if (s.market === "1X2") return X12.includes(s.selection);
  if (s.market === "DC") return DC.includes(s.selection);
  if (s.market === "OU") {
    return (
      OU.includes(s.selection) &&
      typeof s.line === "number" &&
      (OU_LINES as readonly number[]).includes(s.line)
    );
  }
  return false;
}

/** Looks up the current odds for a selection, or null if not offered. */
export function oddsFor(odds: MatchOdds | null | undefined, s: Selection): number | null {
  if (!odds || !isValidSelection(s)) return null;
  let v: number | undefined;
  if (s.market === "1X2") {
    v = s.selection === "HOME" ? odds.x12?.home : s.selection === "DRAW" ? odds.x12?.draw : odds.x12?.away;
  } else if (s.market === "OU") {
    const row = odds.ou?.[String(s.line)];
    v = s.selection === "OVER" ? row?.over : row?.under;
  } else if (s.market === "DC") {
    v =
      s.selection === "HOME_DRAW"
        ? odds.dc?.homeDraw
        : s.selection === "HOME_AWAY"
        ? odds.dc?.homeAway
        : odds.dc?.drawAway;
  }
  return typeof v === "number" && Number.isFinite(v) && v > 1 ? v : null;
}

/** Grades a selection against a final score. */
export function gradeSelection(
  s: Selection,
  homeScore: number,
  awayScore: number
): "WON" | "LOST" {
  const total = homeScore + awayScore;
  const outcome = homeScore > awayScore ? "HOME" : homeScore < awayScore ? "AWAY" : "DRAW";
  let won = false;
  if (s.market === "1X2") {
    won = s.selection === outcome;
  } else if (s.market === "DC") {
    won =
      (s.selection === "HOME_DRAW" && outcome !== "AWAY") ||
      (s.selection === "HOME_AWAY" && outcome !== "DRAW") ||
      (s.selection === "DRAW_AWAY" && outcome !== "HOME");
  } else if (s.market === "OU") {
    const line = s.line ?? 0;
    won = s.selection === "OVER" ? total > line : total < line;
  }
  return won ? "WON" : "LOST";
}

export function marketTitle(market: string): string {
  if (market === "OU") return "Over/Under";
  if (market === "DC") return "Double Chance";
  return "1X2";
}

/** Human label for a pick, e.g. "Over 2.5", "Home or Draw". */
export function selectionLabel(
  s: { market: string; selection: string; line?: number | null },
  homeTeam?: string,
  awayTeam?: string
): string {
  if (s.market === "OU") return `${s.selection === "OVER" ? "Over" : "Under"} ${s.line}`;
  if (s.market === "DC") {
    if (s.selection === "HOME_DRAW") return "Home or Draw (1X)";
    if (s.selection === "HOME_AWAY") return "Home or Away (12)";
    return "Draw or Away (X2)";
  }
  if (s.selection === "HOME") return homeTeam ? `${homeTeam} (Home)` : "Home";
  if (s.selection === "AWAY") return awayTeam ? `${awayTeam} (Away)` : "Away";
  return "Draw";
}

/**
 * Combined odds factor for a slip: the stake once, plus the winnings of
 * every pick ADDED together:  1 + (odds1 - 1) + (odds2 - 1) + ...
 * For one pick this is just its odds. Because it adds instead of
 * multiplying, it can never pay more than a normal multiplied accumulator.
 */
export function combinedOdds(odds: number[]): number {
  return 1 + odds.reduce((acc, o) => acc + (o - 1), 0);
}

/**
 * Payout for a slip: stake x combinedOdds of the winning picks.
 * VOID picks are dropped (they add nothing). Capped at the largest value
 * the ledger's 32-bit integer can hold — a technical limit, not a
 * business cap (2,000,000,000 NGC = 1M USDT).
 */
export const MAX_STORABLE_PAYOUT = 2_000_000_000;

export function slipPayout(stake: number, winningOdds: number[]): number {
  return Math.min(MAX_STORABLE_PAYOUT, Math.round(stake * combinedOdds(winningOdds)));
}