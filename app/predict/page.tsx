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

const MIN_STAKE = 5000;

export default function PredictPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [stakes, setStakes] = useState<Record<string, number>>({});

  function load() {
    fetch("/api/matches")
      .then((r) => r.json())
      .then((d) => setMatches(d.matches ?? []));
  }

  useEffect(load, []);

  function stakeFor(matchId: string) {
    return stakes[matchId] ?? MIN_STAKE;
  }

  async function predict(matchId: string, pick: "HOME" | "DRAW" | "AWAY") {
    const amount = stakeFor(matchId);
    if (amount < MIN_STAKE) {
      setMessage(`Minimum stake is ${MIN_STAKE.toLocaleString()} NGC.`);
      return;
    }
    if (!confirm(`Use ${amount.toLocaleString()} NGC on this prediction?`)) return;

    setBusyId(matchId);
    setMessage(null);
    const res = await fetch("/api/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, pick, amount }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      if (data.error === "BELOW_MIN_STAKE") {
        setMessage(`Minimum stake is ${data.minBet?.toLocaleString()} NGC.`);
      } else if (data.error === "INSUFFICIENT_BALANCE") {
        setMessage("Not enough NGC.");
      } else {
        setMessage("Couldn't submit prediction.");
      }
      return;
    }
    setMessage("Prediction locked in!");
    load();
  }

  return (
    <div className="pt-6 space-y-4">
      <h1 className="scoreboard text-3xl">FOOTBALL PREDICTIONS</h1>
      <p className="text-xs text-muted">Minimum stake: {MIN_STAKE.toLocaleString()} NGC</p>
      {message && <p className="text-sm text-brand">{message}</p>}

      {matches.length === 0 && <p className="text-muted text-sm">No upcoming matches right now.</p>}

      {matches.map((m) => (
        <div key={m.id} className="card">
          <p className="text-xs text-muted mb-1">
            {m.competition ?? "Friendly"} · {new Date(m.kickoff).toLocaleString()}
          </p>
          <p className="font-semibold mb-3">
            {m.homeTeam} <span className="text-brand">vs</span> {m.awayTeam}
          </p>

          <label className="text-xs text-muted">Stake (NGC)</label>
          <input
            type="number"
            min={MIN_STAKE}
            step={500}
            className="input mt-1 mb-3"
            value={stakeFor(m.id)}
            onChange={(e) =>
              setStakes({ ...stakes, [m.id]: Math.round(Number(e.target.value)) })
            }
          />

          <div className="grid grid-cols-3 gap-2">
            <button
              disabled={busyId === m.id}
              onClick={() => predict(m.id, "HOME")}
              className="btn-secondary text-sm py-2"
            >
              {m.homeTeam} <span className="text-brand">Win</span>
            </button>
            <button
              disabled={busyId === m.id}
              onClick={() => predict(m.id, "DRAW")}
              className="btn-secondary text-sm py-2"
            >
              <span className="text-brand">Draw</span>
            </button>
            <button
              disabled={busyId === m.id}
              onClick={() => predict(m.id, "AWAY")}
              className="btn-secondary text-sm py-2"
            >
              {m.awayTeam} <span className="text-brand">Win</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}