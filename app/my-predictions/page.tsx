"use client";
import { useEffect, useState } from "react";

type Leg = {
  pick: string;
  status: string;
  match: { homeTeam: string; awayTeam: string; status: string; kickoff: string };
};

type Slip = {
  id: string;
  stake: number;
  status: string;
  reward: number | null;
  createdAt: string;
  legs: Leg[];
};

function statusColor(status: string) {
  if (status === "WON") return "text-win";
  if (status === "LOST") return "text-loss";
  if (status === "VOID") return "text-muted";
  return "text-brand"; // PENDING
}

export default function MyPredictionsPage() {
  const [slips, setSlips] = useState<Slip[] | null>(null);

  useEffect(() => {
    fetch("/api/predictions/mine")
      .then((r) => r.json())
      .then((d) => setSlips(d.slips ?? []));
  }, []);

  if (slips === null) {
    return <p className="text-muted pt-10 text-center">Loading…</p>;
  }

  return (
    <div className="pt-6 space-y-4">
      <h1 className="scoreboard text-3xl">MY PREDICTIONS</h1>
      <p className="text-xs text-muted">
        Every accumulator you've placed and how it's going. All picks in a slip must win for it
        to pay out.
      </p>

      {slips.length === 0 && (
        <p className="text-muted text-sm">
          You haven't placed any predictions yet — head to Prediction to build your first
          accumulator.
        </p>
      )}

      {slips.map((slip) => (
        <div key={slip.id} className="card">
          <div className="flex justify-between items-center mb-2">
            <p className="text-xs text-muted">
              {new Date(slip.createdAt).toLocaleDateString()} · Staked{" "}
              {slip.stake.toLocaleString()} NGC
            </p>
            <span className={`text-sm font-semibold ${statusColor(slip.status)}`}>
              {slip.status}
            </span>
          </div>

          {slip.status === "WON" && slip.reward != null && (
            <p className="text-sm text-win mb-2">Won {slip.reward.toLocaleString()} NGC</p>
          )}

          <div className="space-y-2">
            {slip.legs.map((leg, i) => (
              <div
                key={i}
                className="flex justify-between items-center text-sm border-t border-white/5 pt-2"
              >
                <div>
                  <p>
                    {leg.match.homeTeam} <span className="text-brand">vs</span>{" "}
                    {leg.match.awayTeam}
                  </p>
                  <p className="text-xs text-muted">
                    Picked: {leg.pick} · {new Date(leg.match.kickoff).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-xs font-semibold ${statusColor(leg.status)}`}>
                  {leg.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}