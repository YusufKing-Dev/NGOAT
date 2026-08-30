"use client";
import { useEffect, useState } from "react";

const MIN_STAKE = 40000;
const DURATIONS: { value: string; label: string }[] = [
  { value: "THREE_MONTHS", label: "3 months" },
  { value: "SIX_MONTHS", label: "6 months" },
  { value: "ONE_YEAR", label: "1 year" },
];

type StakeRow = {
  id: string;
  principal: number;
  duration: string;
  dailyRatePct: number;
  status: string;
  startedAt: string;
  maturesAt: string;
  releaseAmount: number | null;
};

export default function StakePage() {
  const [stakes, setStakes] = useState<StakeRow[]>([]);
  const [amount, setAmount] = useState(MIN_STAKE);
  const [duration, setDuration] = useState("THREE_MONTHS");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    fetch("/api/stakes")
      .then((r) => r.json())
      .then((d) => setStakes(d.stakes ?? []));
  }

  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/stakes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, duration }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      if (data.error === "BELOW_MIN_STAKE") {
        setMessage(`Minimum stake is ${data.minStake?.toLocaleString()} NGC.`);
      } else if (data.error === "INSUFFICIENT_BALANCE") {
        setMessage("Not enough NGC. Note: your free bonus alone isn't enough — you'll need to buy more.");
      } else {
        setMessage("Couldn't create stake.");
      }
      return;
    }
    setMessage("Staked! It'll release automatically at maturity.");
    load();
  }

  return (
    <div className="pt-6 space-y-4">
      <h1 className="scoreboard text-3xl">STAKE NGC</h1>
      <p className="text-xs text-muted">
        Minimum {MIN_STAKE.toLocaleString()} NGC. Grows 0.1% daily while locked. No early
        withdrawal — the full amount (principal + growth) releases automatically when the term
        ends.
      </p>

      <form onSubmit={submit} className="card space-y-3">
        <label className="text-sm text-muted">Amount (NGC)</label>
        <input
          type="number"
          min={MIN_STAKE}
          step={1000}
          className="input"
          value={amount}
          onChange={(e) => setAmount(Math.round(Number(e.target.value)))}
        />
        <label className="text-sm text-muted">Duration</label>
        <select className="input" value={duration} onChange={(e) => setDuration(e.target.value)}>
          {DURATIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        {message && <p className="text-sm text-brand">{message}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? "Staking…" : "Stake NGC"}
        </button>
      </form>

      <div className="space-y-3">
        <h2 className="text-sm text-muted uppercase tracking-wide">Your Stakes</h2>
        {stakes.length === 0 && <p className="text-sm text-muted">No stakes yet.</p>}
        {stakes.map((s) => (
          <div key={s.id} className="card text-sm">
            <div className="flex justify-between mb-1">
              <span className="font-semibold">{s.principal.toLocaleString()} NGC</span>
              <span
                className={
                  s.status === "RELEASED"
                    ? "text-win"
                    : s.status === "ACTIVE"
                    ? "text-brand"
                    : "text-muted"
                }
              >
                {s.status}
              </span>
            </div>
            <p className="text-muted text-xs">
              {DURATIONS.find((d) => d.value === s.duration)?.label} · matures{" "}
              {new Date(s.maturesAt).toLocaleDateString()}
            </p>
            {s.releaseAmount != null && (
              <p className="text-xs text-win mt-1">
                Released: {s.releaseAmount.toLocaleString()} NGC
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}