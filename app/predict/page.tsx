"use client";
import { useEffect, useState } from "react";

type Match = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  competition: string | null;
  kickoff: string;
  predictionDeadline: string;
};

type Pick = "HOME" | "DRAW" | "AWAY";

const MIN_STAKE = 5000;
const MIN_LEGS = 5;

export default function PredictPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [stake, setStake] = useState(MIN_STAKE);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    fetch("/api/matches")
      .then((r) => r.json())
      .then((d) => setMatches(d.matches ?? []));
  }

  useEffect(load, []);

  function togglePick(matchId: string, pick: Pick) {
    setPicks((prev) => {
      const next = { ...prev };
      if (next[matchId] === pick) {
        delete next[matchId]; // tap the same pick again to deselect
      } else {
        next[matchId] = pick;
      }
      return next;
    });
  }

  const legCount = Object.keys(picks).length;

  async function submitSlip() {
    if (legCount < MIN_LEGS) {
      setMessage(`Pick at least ${MIN_LEGS} matches to build an accumulator.`);
      return;
    }
    if (stake < MIN_STAKE) {
      setMessage(`Minimum stake is ${MIN_STAKE.toLocaleString()} NGC.`);
      return;
    }
    const legs = Object.entries(picks).map(([matchId, pick]) => ({ matchId, pick }));
    if (
      !confirm(
        `Use ${stake.toLocaleString()} NGC across ${legCount} matches? All ${legCount} picks must win to get paid.`
      )
    )
      return;

    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ legs, amount: stake }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      if (data.error === "TOO_FEW_LEGS") {
        setMessage(`Pick at least ${data.minLegs} matches.`);
      } else if (data.error === "BELOW_MIN_STAKE") {
        setMessage(`Minimum stake is ${data.minBet?.toLocaleString()} NGC.`);
      } else if (data.error === "INSUFFICIENT_BALANCE") {
        setMessage("Not enough NGC.");
      } else if (data.error === "ALREADY_PREDICTED_MATCH") {
        setMessage("You've already picked one of these matches.");
      } else {
        setMessage("Couldn't submit accumulator.");
      }
      return;
    }
    setMessage("Accumulator placed!");
    setPicks({});
    load();
  }

  return (
    <div className="pt-6 space-y-4 pb-28">
      <h1 className="scoreboard text-3xl">FOOTBALL PREDICTIONS</h1>
      <p className="text-xs text-muted">
        Accumulator only — pick at least {MIN_LEGS} matches, minimum stake{" "}
        {MIN_STAKE.toLocaleString()} NGC. Every pick must win to get paid.
      </p>
      {message && <p className="text-sm text-brand">{message}</p>}

      {matches.length === 0 && <p className="text-muted text-sm">No upcoming matches right now.</p>}

      {matches.map((m) => {
        const selected = picks[m.id];
        return (
          <div key={m.id} className="card">
            <p className="text-xs text-muted mb-1">
              {m.competition ?? "Friendly"} · {new Date(m.kickoff).toLocaleString()}
            </p>
            <p className="font-semibold mb-3 break-words">
              {m.homeTeam} <span className="text-brand">vs</span> {m.awayTeam}
            </p>
            <div className="grid grid-cols-3 gap-2 items-stretch">
              <button
                onClick={() => togglePick(m.id, "HOME")}
                className={
                  (selected === "HOME" ? "btn-primary" : "btn-secondary") +
                  " flex flex-col items-center justify-center gap-1 text-xs sm:text-sm py-2 px-1 h-full text-center leading-tight"
                }
              >
                <span className="break-words hyphens-auto line-clamp-2">{m.homeTeam}</span>
                <span className="text-brand text-[0.7rem] sm:text-xs font-semibold">Win</span>
              </button>
              <button
                onClick={() => togglePick(m.id, "DRAW")}
                className={
                  (selected === "DRAW" ? "btn-primary" : "btn-secondary") +
                  " flex flex-col items-center justify-center py-2 px-1 h-full"
                }
              >
                <span className="text-brand text-xs sm:text-sm font-semibold">Draw</span>
              </button>
              <button
                onClick={() => togglePick(m.id, "AWAY")}
                className={
                  (selected === "AWAY" ? "btn-primary" : "btn-secondary") +
                  " flex flex-col items-center justify-center gap-1 text-xs sm:text-sm py-2 px-1 h-full text-center leading-tight"
                }
              >
                <span className="break-words hyphens-auto line-clamp-2">{m.awayTeam}</span>
                <span className="text-brand text-[0.7rem] sm:text-xs font-semibold">Win</span>
              </button>
            </div>
          </div>
        );
      })}

      {/* Sticky slip builder */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-white/10 p-4">
        <div className="max-w-md mx-auto space-y-2">
          <div className="flex justify-between text-xs text-muted">
            <span>
              {legCount} match{legCount === 1 ? "" : "es"} selected (min {MIN_LEGS})
            </span>
          </div>
          <input
            type="number"
            min={MIN_STAKE}
            step={500}
            value={stake}
            onChange={(e) => setStake(Math.round(Number(e.target.value)))}
            className="input"
            placeholder="Stake (NGC)"
          />
          <button
            onClick={submitSlip}
            disabled={busy || legCount < MIN_LEGS}
            className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Placing…" : `Place Accumulator (${legCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}