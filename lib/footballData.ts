const BASE_URL = "https://api.football-data.org/v4";

// Competitions covered by football-data.org's free tier.
export const DEFAULT_COMPETITIONS = ["PL", "PD", "BL1", "SA", "FL1", "CL"];

function apiKey(): string {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error("FOOTBALL_DATA_API_KEY is not set");
  return key;
}

async function fdFetch(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "X-Auth-Token": apiKey() },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`football-data.org ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Upcoming (not yet played) fixtures for a competition, e.g. "PL",
 * limited to the next `daysAhead` days. Without a date range,
 * football-data.org returns EVERY scheduled fixture for the rest of
 * the season (hundreds per competition) — far too many to list on a
 * predictions page in one go.
 */
export async function fetchScheduledFixtures(competitionCode: string, daysAhead = 7) {
  const dateFrom = new Date().toISOString().slice(0, 10);
  const dateTo = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const data = await fdFetch(
    `/competitions/${competitionCode}/matches?status=SCHEDULED&dateFrom=${dateFrom}&dateTo=${dateTo}`
  );
  return (data.matches ?? []) as any[];
}

/** Single fixture by football-data.org's own match ID — used to check results. */
export async function fetchFixtureById(externalId: string) {
  return fdFetch(`/matches/${externalId}`);
}