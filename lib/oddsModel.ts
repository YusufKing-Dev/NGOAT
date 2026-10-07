/**
 * Automatic odds from team strength. Pure maths, no imports.
 *
 * 1. Expected goals (xG) for each side from league-table attack/defence
 *    strength (goals for/against per game), shrunk toward the league
 *    average so early-season tables with few games don't produce silly
 *    prices, plus a home-advantage factor.
 * 2. A Poisson scoreline grid (with a small Dixon-Coles correction for
 *    low scores, so draws aren't under-priced) gives probabilities for
 *    every market from ONE model — so 1X2, Over/Under and Double Chance
 *    are always consistent with each other.
 * 3. A margin is applied so the platform keeps an edge.
 */

import type { MatchOdds } from "./markets";
import { OU_LINES } from "./markets";

export type TableRow = {
  teamId: number;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
};

const HOME_ADV = 1.11; // multiplies home xG
const AWAY_FACTOR = 0.9; // multiplies away xG
const SHRINK_GAMES = 5; // pseudo-games of league-average form
const DC_RHO = -0.08; // Dixon-Coles low-score correction
const MAX_GOALS = 12;

// Selections priced below this are not offered (they'd be near-free money
// for users and any small model error would flip the edge to them).
export const MIN_OFFERED_ODDS = 1.1;
export const MAX_OFFERED_ODDS = 60;

export const DEFAULT_MARGIN = 0.07;

export function expectedGoals(
  rows: TableRow[],
  homeId: number,
  awayId: number
): { xgHome: number; xgAway: number } | null {
  const home = rows.find((r) => r.teamId === homeId);
  const away = rows.find((r) => r.teamId === awayId);
  if (!home || !away) return null;

  const totalGames = rows.reduce((s, r) => s + r.played, 0);
  const totalGoals = rows.reduce((s, r) => s + r.goalsFor, 0);
  // average goals scored by one team in one game
  const mu = totalGames > 0 ? totalGoals / totalGames : 1.35;
  if (!(mu > 0)) return null;

  const attack = (r: TableRow) => (r.goalsFor + SHRINK_GAMES * mu) / ((r.played + SHRINK_GAMES) * mu);
  const defence = (r: TableRow) => (r.goalsAgainst + SHRINK_GAMES * mu) / ((r.played + SHRINK_GAMES) * mu);

  const xgHome = mu * HOME_ADV * attack(home) * defence(away);
  const xgAway = mu * AWAY_FACTOR * attack(away) * defence(home);
  return { xgHome: clamp(xgHome, 0.2, 4.5), xgAway: clamp(xgAway, 0.2, 4.5) };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function poissonPmf(lambda: number): number[] {
  const out: number[] = [];
  let p = Math.exp(-lambda);
  out.push(p);
  for (let k = 1; k <= MAX_GOALS; k++) {
    p = (p * lambda) / k;
    out.push(p);
  }
  return out;
}

function scoreGrid(xgHome: number, xgAway: number): number[][] {
  const ph = poissonPmf(xgHome);
  const pa = poissonPmf(xgAway);
  const grid: number[][] = [];
  let sum = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    grid[h] = [];
    for (let a = 0; a <= MAX_GOALS; a++) {
      let tau = 1;
      if (h === 0 && a === 0) tau = 1 - xgHome * xgAway * DC_RHO;
      else if (h === 0 && a === 1) tau = 1 + xgHome * DC_RHO;
      else if (h === 1 && a === 0) tau = 1 + xgAway * DC_RHO;
      else if (h === 1 && a === 1) tau = 1 - DC_RHO;
      const p = ph[h] * pa[a] * Math.max(tau, 0);
      grid[h][a] = p;
      sum += p;
    }
  }
  // renormalise (truncation + correction)
  for (let h = 0; h <= MAX_GOALS; h++) for (let a = 0; a <= MAX_GOALS; a++) grid[h][a] /= sum;
  return grid;
}

function toOdds(p: number, margin: number): number | undefined {
  if (!(p > 0)) return undefined;
  const o = 1 / (p * (1 + margin));
  if (!Number.isFinite(o) || o < MIN_OFFERED_ODDS) return undefined; // not offered
  return Math.round(Math.min(o, MAX_OFFERED_ODDS) * 100) / 100;
}

export function buildOdds(xgHome: number, xgAway: number, margin = DEFAULT_MARGIN): MatchOdds | null {
  const grid = scoreGrid(xgHome, xgAway);
  let pH = 0,
    pD = 0,
    pA = 0;
  const totalDist: number[] = new Array(2 * MAX_GOALS + 1).fill(0);
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = grid[h][a];
      if (h > a) pH += p;
      else if (h === a) pD += p;
      else pA += p;
      totalDist[h + a] += p;
    }
  }

  const home = toOdds(pH, margin);
  const draw = toOdds(pD, margin);
  const away = toOdds(pA, margin);
  // A side so dominant that its price falls under the floor is simply not
  // offered (the other 1X2 options and the other markets still are).

  const ou: MatchOdds["ou"] = {};
  for (const line of OU_LINES) {
    let pUnder = 0;
    for (let g = 0; g <= 2 * MAX_GOALS; g++) if (g < line) pUnder += totalDist[g];
    const over = toOdds(1 - pUnder, margin);
    const under = toOdds(pUnder, margin);
    if (over != null || under != null) ou[String(line)] = { over, under };
  }

  const dc = {
    homeDraw: toOdds(pH + pD, margin),
    homeAway: toOdds(pH + pA, margin),
    drawAway: toOdds(pD + pA, margin),
  };
  const anything =
    home != null || draw != null || away != null || Object.keys(ou).length > 0 ||
    Object.values(dc).some((v) => v != null);
  if (!anything) return null;

  return {
    v: 1,
    x12: { home, draw, away },
    ou,
    dc,
    meta: {
      xgHome: Math.round(xgHome * 100) / 100,
      xgAway: Math.round(xgAway * 100) / 100,
      source: "model",
    },
  };
}