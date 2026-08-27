"use client";
import { useEffect, useState } from "react";

type Row = { username: string; points: number; wins: number };

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => setRows(d.leaderboard ?? []));
  }, []);

  return (
    <div className="pt-6 space-y-4">
      <h1 className="scoreboard text-3xl">TOP PREDICTORS</h1>
      <div className="card divide-y divide-white/5">
        {rows.length === 0 && <p className="text-muted text-sm">No results yet.</p>}
        {rows.map((r, i) => (
          <div key={r.username} className="flex items-center justify-between py-2 text-sm">
            <span className="text-muted w-6">{i + 1}</span>
            <span className="flex-1">{r.username}</span>
            <span className="text-brand scoreboard">{r.points.toLocaleString()}</span>
            <span className="text-muted w-16 text-right">{r.wins} wins</span>
          </div>
        ))}
      </div>
    </div>
  );
}