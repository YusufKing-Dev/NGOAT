"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  OU_LINES,
  oddsFor,
  selectionLabel,
  marketTitle,
  slipPayout,
  type MatchOdds,
  type MarketKey,
} from "@/lib/markets";

type Match = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  competition: string | null;
  kickoff: string;
  predictionDeadline: string;
  odds: MatchOdds;
};

type Pick = {
  key: string;
  matchId: string;
  market: MarketKey;
  selection: string;
  line: number | null;
  odds: number;
};

type Mode = "SINGLE" | "MULTIPLE";

const DEFAULT_MIN_STAKE = 10000;
const DEFAULT_MIN_LEGS = 2;

const pickKey = (matchId: string, market: string, selection: string, line: number | null) =>
  `${matchId}|${market}|${selection}|${line ?? ""}`;

const fmt = (n: number) => Math.round(n).toLocaleString();

// Digits only, no leading zeros. An empty box stays EMPTY (not "0"), so
// clearing the field and typing a new number never leaves a stray 0.
const cleanAmount = (raw: string) => raw.replace(/\D/g, "").replace(/^0+/, "");

function OddsButton({
  label,
  odds,
  selected,
  onClick,
}: {
  label: string;
  odds?: number;
  selected: boolean;
  onClick: () => void;
}) {
  if (odds == null) {
    return (
      <div className="bg-surface2 rounded-lg py-2 px-1 text-center text-xs text-muted opacity-40">
        <div>{label}</div>
        <div>—</div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        (selected ? "btn-primary" : "btn-secondary") +
        " flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-xs leading-tight"
      }
    >
      <span className="text-[0.7rem] opacity-80">{label}</span>
      <span className="font-semibold text-sm">{odds.toFixed(2)}</span>
    </button>
  );
}

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-white/5 pt-2">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between py-1 text-sm font-semibold"
      >
        <span>{title}</span>
        <span className="text-brand text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="pt-2 pb-1">{children}</div>}
    </div>
  );
}

export default function PredictPage() {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [openMatch, setOpenMatch] = useState<string | null>(null);
  const [closedSections, setClosedSections] = useState<Record<string, boolean>>({});
  const [slip, setSlip] = useState<Pick[]>([]);
  const [mode, setMode] = useState<Mode>("SINGLE");
  const [minStake, setMinStake] = useState(DEFAULT_MIN_STAKE);
  const [minLegs, setMinLegs] = useState(DEFAULT_MIN_LEGS);
  const [singleStakes, setSingleStakes] = useState<Record<string, string>>({});
  const [multiStake, setMultiStake] = useState("");
  const [slipOpen, setSlipOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    fetch("/api/matches")
      .then((r) => r.json())
      .then((d) => setMatches(d.matches ?? []))
      .catch(() => setMatches([]));
    // Pull the live platform-config values so this page always matches
    // whatever the server actually enforces.
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        const liveMin = d.minBetCredits ?? DEFAULT_MIN_STAKE;
        setMinStake(liveMin);
        setMinLegs(d.minSlipLegs ?? DEFAULT_MIN_LEGS);
        setMultiStake((s) => s || String(liveMin));
      })
      .catch(() => {});
  }

  useEffect(load, []);

  const matchById = useMemo(() => new Map((matches ?? []).map((m) => [m.id, m])), [matches]);

  function togglePick(m: Match, market: MarketKey, selection: string, line: number | null) {
    const odds = oddsFor(m.odds, { market, selection, line });
    if (odds == null) return;
    const key = pickKey(m.id, market, selection, line);
    setMessage(null);
    setSlip((prev) =>
      prev.some((p) => p.key === key)
        ? prev.filter((p) => p.key !== key)
        : [...prev, { key, matchId: m.id, market, selection, line, odds }]
    );
    setSingleStakes((prev) => (prev[key] !== undefined ? prev : { ...prev, [key]: String(minStake) }));
  }

  const isSelected = (m: Match, market: string, selection: string, line: number | null) =>
    slip.some((p) => p.key === pickKey(m.id, market, selection, line));

  const sectionOpen = (matchId: string, market: string) => !closedSections[`${matchId}:${market}`];
  const toggleSection = (matchId: string, market: string) =>
    setClosedSections((prev) => ({ ...prev, [`${matchId}:${market}`]: !prev[`${matchId}:${market}`] }));

  // ---- betslip maths ----
  const dupMatchIds = useMemo(() => {
    const count: Record<string, number> = {};
    slip.forEach((p) => (count[p.matchId] = (count[p.matchId] ?? 0) + 1));
    return Object.keys(count).filter((id) => count[id] > 1);
  }, [slip]);

  const totalOdds = slip.reduce((acc, p) => acc * p.odds, 1);
  const multiStakeNum = Number(multiStake || 0);
  const multiPayout = slipPayout(multiStakeNum, slip.map((p) => p.odds));
  const singleTotal = slip.reduce((acc, p) => acc + Number(singleStakes[p.key] || 0), 0);
  const singlePayout = slip.reduce(
    (acc, p) => acc + slipPayout(Number(singleStakes[p.key] || 0), [p.odds]),
    0
  );

  const canPlace =
    slip.length > 0 &&
    !busy &&
    (mode === "SINGLE"
      ? slip.every((p) => Number(singleStakes[p.key] || 0) >= minStake)
      : slip.length >= minLegs && dupMatchIds.length === 0 && multiStakeNum >= minStake);

  async function place() {
    setMessage(null);
    if (!canPlace) return;

    let body: any;
    let summary: string;
    if (mode === "SINGLE") {
      body = {
        mode,
        picks: slip.map((p) => ({
          matchId: p.matchId,
          market: p.market,
          selection: p.selection,
          line: p.line,
          odds: p.odds,
          stake: Number(singleStakes[p.key]),
        })),
      };
      summary = `Place ${slip.length} single bet${slip.length === 1 ? "" : "s"} for ${fmt(singleTotal)} NGC in total?`;
    } else {
      body = {
        mode,
        amount: multiStakeNum,
        picks: slip.map((p) => ({
          matchId: p.matchId,
          market: p.market,
          selection: p.selection,
          line: p.line,
          odds: p.odds,
        })),
      };
      summary = `Stake ${fmt(multiStakeNum)} NGC on a ${slip.length}-pick multiple at odds ${totalOdds.toFixed(
        2
      )}? All ${slip.length} picks must win to get paid.`;
    }
    if (!confirm(summary)) return;

    setBusy(true);
    const res = await fetch("/api/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (res.ok) {
      setMessage(mode === "SINGLE" ? "Bets placed!" : "Multiple placed!");
      setSlip([]);
      setSlipOpen(false);
      load();
      return;
    }

    switch (data.error) {
      case "ODDS_CHANGED": {
        const changes: { matchId: string; market: string; selection: string; line: number | null; odds: number }[] =
          data.changes ?? [];
        setSlip((prev) =>
          prev.map((p) => {
            const c = changes.find((x) => pickKey(x.matchId, x.market, x.selection, x.line) === p.key);
            return c ? { ...p, odds: c.odds } : p;
          })
        );
        setMessage("Odds changed on some picks. Check the new odds, then place again.");
        load();
        break;
      }
      case "SELECTION_UNAVAILABLE":
      case "PREDICTIONS_CLOSED":
        setSlip((prev) => prev.filter((p) => p.matchId !== data.matchId));
        setMessage("A pick is no longer available and was removed from your betslip.");
        load();
        break;
      case "TOO_FEW_LEGS":
        setMessage(`A multiple needs at least ${data.minLegs} picks.`);
        break;
      case "BELOW_MIN_STAKE":
        setMessage(`Minimum stake is ${fmt(data.minBet ?? minStake)} NGC.`);
        break;
      case "INSUFFICIENT_BALANCE":
        setMessage("Not enough NGC.");
        break;
      case "DUPLICATE_MATCH_IN_SLIP":
        setMessage("A multiple can only have one pick per match.");
        break;
      case "PREDICTIONS_DISABLED":
        setMessage("Predictions are switched off right now.");
        break;
      default:
        setMessage("Couldn't place your prediction. Please try again.");
    }
  }

  return (
    <div className="pt-6 space-y-4 pb-40">
      <h1 className="scoreboard text-3xl">FOOTBALL PREDICTIONS</h1>
      {message && <p className="text-sm text-brand">{message}</p>}

      {matches === null && <p className="text-muted text-sm">Loading matches…</p>}
      {matches !== null && matches.length === 0 && (
        <p className="text-muted text-sm">No matches are open for prediction right now.</p>
      )}

      {(matches ?? []).map((m) => {
        const open = openMatch === m.id;
        const o = m.odds;
        return (
          <div key={m.id} className="card">
            <button
              type="button"
              onClick={() => setOpenMatch(open ? null : m.id)}
              className="w-full text-left"
            >
              <p className="text-xs text-muted mb-1 flex justify-between gap-2">
                <span>
                  {m.competition ?? "Football"} · {new Date(m.kickoff).toLocaleString()}
                </span>
                <span className="text-brand">{open ? "▲" : "▼"}</span>
              </p>
              <p className="font-semibold break-words">
                {m.homeTeam} <span className="text-brand">vs</span> {m.awayTeam}
              </p>
            </button>

            {!open && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                <OddsButton
                  label="Home"
                  odds={o.x12?.home}
                  selected={isSelected(m, "1X2", "HOME", null)}
                  onClick={() => togglePick(m, "1X2", "HOME", null)}
                />
                <OddsButton
                  label="Draw"
                  odds={o.x12?.draw}
                  selected={isSelected(m, "1X2", "DRAW", null)}
                  onClick={() => togglePick(m, "1X2", "DRAW", null)}
                />
                <OddsButton
                  label="Away"
                  odds={o.x12?.away}
                  selected={isSelected(m, "1X2", "AWAY", null)}
                  onClick={() => togglePick(m, "1X2", "AWAY", null)}
                />
              </div>
            )}

            {open && (
              <div className="mt-3 space-y-2">
                <Section
                  title="1X2"
                  open={sectionOpen(m.id, "1X2")}
                  onToggle={() => toggleSection(m.id, "1X2")}
                >
                  <div className="grid grid-cols-3 gap-2">
                    <OddsButton
                      label="Home"
                      odds={o.x12?.home}
                      selected={isSelected(m, "1X2", "HOME", null)}
                      onClick={() => togglePick(m, "1X2", "HOME", null)}
                    />
                    <OddsButton
                      label="Draw"
                      odds={o.x12?.draw}
                      selected={isSelected(m, "1X2", "DRAW", null)}
                      onClick={() => togglePick(m, "1X2", "DRAW", null)}
                    />
                    <OddsButton
                      label="Away"
                      odds={o.x12?.away}
                      selected={isSelected(m, "1X2", "AWAY", null)}
                      onClick={() => togglePick(m, "1X2", "AWAY", null)}
                    />
                  </div>
                </Section>

                <Section
                  title="Over/Under"
                  open={sectionOpen(m.id, "OU")}
                  onToggle={() => toggleSection(m.id, "OU")}
                >
                  <div className="grid grid-cols-[3rem_1fr_1fr] gap-2 items-stretch text-center">
                    <span />
                    <span className="text-xs text-muted">Over</span>
                    <span className="text-xs text-muted">Under</span>
                    {OU_LINES.map((line) => {
                      const row = o.ou?.[String(line)];
                      if (!row || (row.over == null && row.under == null)) return null;
                      return (
                        <Fragment key={line}>
                          <span className="self-center text-sm text-muted">{line}</span>
                          <OddsButton
                            label="Over"
                            odds={row.over}
                            selected={isSelected(m, "OU", "OVER", line)}
                            onClick={() => togglePick(m, "OU", "OVER", line)}
                          />
                          <OddsButton
                            label="Under"
                            odds={row.under}
                            selected={isSelected(m, "OU", "UNDER", line)}
                            onClick={() => togglePick(m, "OU", "UNDER", line)}
                          />
                        </Fragment>
                      );
                    })}
                  </div>
                </Section>

                <Section
                  title="Double Chance"
                  open={sectionOpen(m.id, "DC")}
                  onToggle={() => toggleSection(m.id, "DC")}
                >
                  <div className="grid grid-cols-3 gap-2">
                    <OddsButton
                      label="Home or Draw"
                      odds={o.dc?.homeDraw}
                      selected={isSelected(m, "DC", "HOME_DRAW", null)}
                      onClick={() => togglePick(m, "DC", "HOME_DRAW", null)}
                    />
                    <OddsButton
                      label="Home or Away"
                      odds={o.dc?.homeAway}
                      selected={isSelected(m, "DC", "HOME_AWAY", null)}
                      onClick={() => togglePick(m, "DC", "HOME_AWAY", null)}
                    />
                    <OddsButton
                      label="Draw or Away"
                      odds={o.dc?.drawAway}
                      selected={isSelected(m, "DC", "DRAW_AWAY", null)}
                      onClick={() => togglePick(m, "DC", "DRAW_AWAY", null)}
                    />
                  </div>
                </Section>
              </div>
            )}
          </div>
        );
      })}

      {/* Betslip */}
      {slip.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-white/10 z-40">
          <div className="max-w-md mx-auto">
            <button
              type="button"
              onClick={() => setSlipOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3"
            >
              <span className="font-semibold">
                Betslip <span className="bg-surface2 text-brand rounded-full px-2 py-0.5 text-xs ml-1">{slip.length}</span>
              </span>
              <span className="text-xs text-muted">{slipOpen ? "Hide ▼" : "Open ▲"}</span>
            </button>

            {slipOpen && (
              <div className="px-4 pb-4 space-y-3 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("SINGLE")}
                    className={(mode === "SINGLE" ? "btn-primary" : "btn-secondary") + " py-2 text-sm"}
                  >
                    Single
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("MULTIPLE")}
                    className={(mode === "MULTIPLE" ? "btn-primary" : "btn-secondary") + " py-2 text-sm"}
                  >
                    Multiple
                  </button>
                </div>

                {slip.map((p) => {
                  const m = matchById.get(p.matchId);
                  const stakeNum = Number(singleStakes[p.key] || 0);
                  const dup = mode === "MULTIPLE" && dupMatchIds.includes(p.matchId);
                  return (
                    <div key={p.key} className="bg-surface2 rounded-lg p-3">
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold break-words">
                            {selectionLabel(p, m?.homeTeam, m?.awayTeam)}
                          </p>
                          <p className="text-xs text-muted break-words">
                            {m ? `${m.homeTeam} vs ${m.awayTeam}` : "Match"}
                          </p>
                          <p className="text-[0.7rem] text-muted">{marketTitle(p.market)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-brand font-semibold">{p.odds.toFixed(2)}</p>
                          <button
                            type="button"
                            onClick={() => setSlip((prev) => prev.filter((x) => x.key !== p.key))}
                            className="text-xs text-muted"
                          >
                            ✕ Remove
                          </button>
                        </div>
                      </div>

                      {mode === "SINGLE" && (
                        <>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={singleStakes[p.key] ?? ""}
                            onChange={(e) =>
                              setSingleStakes((prev) => ({ ...prev, [p.key]: cleanAmount(e.target.value) }))
                            }
                            className="input mt-2"
                            placeholder={`Stake (min ${fmt(minStake)})`}
                          />
                          {stakeNum > 0 && (
                            <p className="text-xs text-muted mt-1">
                              To return: {fmt(slipPayout(stakeNum, [p.odds]))} NGC
                            </p>
                          )}
                        </>
                      )}

                      {dup && (
                        <p className="text-xs text-loss mt-2">
                          A multiple allows only one pick per match. Remove one, or switch to Single.
                        </p>
                      )}
                    </div>
                  );
                })}

                {mode === "MULTIPLE" && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Total odds</span>
                      <span className="text-brand font-semibold">{totalOdds.toFixed(2)}</span>
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={multiStake}
                      onChange={(e) => setMultiStake(cleanAmount(e.target.value))}
                      className="input"
                      placeholder={`Stake (min ${fmt(minStake)})`}
                    />
                    {slip.length < minLegs && (
                      <p className="text-xs text-muted">
                        Add at least {minLegs} picks (from different matches) for a multiple.
                      </p>
                    )}
                    <div className="bg-surface2 rounded-lg px-3 py-2 flex items-center justify-between">
                      <span className="text-xs text-muted">Potential return</span>
                      <span className="text-brand font-semibold">{fmt(multiPayout)} NGC</span>
                    </div>
                  </div>
                )}

                {mode === "SINGLE" && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Total stake</span>
                      <span>{fmt(singleTotal)} NGC</span>
                    </div>
                    <div className="bg-surface2 rounded-lg px-3 py-2 flex items-center justify-between">
                      <span className="text-xs text-muted">Potential return (all win)</span>
                      <span className="text-brand font-semibold">{fmt(singlePayout)} NGC</span>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={place}
                  disabled={!canPlace}
                  className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy ? "Placing…" : mode === "SINGLE" ? `Place ${slip.length} bet${slip.length === 1 ? "" : "s"}` : "Place multiple"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}