import { prisma } from "./prisma";
import { fetchStandings } from "./footballData";
import { buildOdds, expectedGoals, DEFAULT_MARGIN, type TableRow } from "./oddsModel";

/** Flattens a football-data.org standings response into plain table rows. */
export function rowsFromStandings(data: any): TableRow[] {
  const out: TableRow[] = [];
  for (const st of data?.standings ?? []) {
    if (st.type && st.type !== "TOTAL") continue; // ignore HOME / AWAY tables
    for (const r of st.table ?? []) {
      if (r?.team?.id == null) continue;
      out.push({
        teamId: r.team.id,
        played: r.playedGames ?? 0,
        goalsFor: r.goalsFor ?? 0,
        goalsAgainst: r.goalsAgainst ?? 0,
      });
    }
  }
  return out;
}

async function getMargin(): Promise<number> {
  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const m = config?.oddsMargin;
  return typeof m === "number" && m >= 0 && m < 0.3 ? m : DEFAULT_MARGIN;
}

/**
 * (Re)generates odds for every upcoming, not-hand-priced match of one
 * competition. One standings request per call, so it stays well inside
 * football-data.org's free-tier rate limit (10/min).
 */
export async function refreshOddsForCompetition(code: string) {
  const matches = await prisma.match.findMany({
    where: {
      competitionCode: code,
      status: "UPCOMING",
      oddsManual: false,
      kickoff: { gt: new Date() },
    },
  });
  if (matches.length === 0) return { code, matches: 0, updated: 0, skipped: 0 };

  const rows = rowsFromStandings(await fetchStandings(code));
  const margin = await getMargin();

  let updated = 0;
  let skipped = 0;
  for (const m of matches) {
    if (m.homeTeamExtId == null || m.awayTeamExtId == null) {
      skipped++;
      continue;
    }
    const xg = expectedGoals(rows, m.homeTeamExtId, m.awayTeamExtId);
    const odds = xg ? buildOdds(xg.xgHome, xg.xgAway, margin) : null;
    if (!odds) {
      skipped++;
      continue;
    }
    await prisma.match.update({
      where: { id: m.id },
      data: { odds: odds as any, oddsUpdatedAt: new Date() },
    });
    updated++;
  }
  return { code, matches: matches.length, updated, skipped };
}

/** Regenerates one match from the model (admin "Regenerate" button). */
export async function regenerateOddsForMatch(matchId: string) {
  const m = await prisma.match.findUnique({ where: { id: matchId } });
  if (!m) throw new Error("MATCH_NOT_FOUND");
  if (!m.competitionCode || m.homeTeamExtId == null || m.awayTeamExtId == null) {
    throw new Error("NO_TEAM_DATA");
  }
  const rows = rowsFromStandings(await fetchStandings(m.competitionCode));
  const xg = expectedGoals(rows, m.homeTeamExtId, m.awayTeamExtId);
  const odds = xg ? buildOdds(xg.xgHome, xg.xgAway, await getMargin()) : null;
  if (!odds) throw new Error("COULD_NOT_PRICE");
  return prisma.match.update({
    where: { id: m.id },
    data: { odds: odds as any, oddsManual: false, oddsUpdatedAt: new Date() },
  });
}