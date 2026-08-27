"use client";
import { useEffect, useState } from "react";

type Deposit = {
  id: string;
  usdtAmount: number;
  network: string;
  txHash: string;
  creditsToIssue: number;
  status: string;
  user: { username: string; email: string };
};

type Withdrawal = {
  id: string;
  usdtAmount: number;
  network: string;
  walletAddress: string;
  status: string;
  user: { username: string; email: string };
};

type Match = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  status: string;
  entryCredits: number;
  rewardCredits: number;
  kickoff: string;
};

export default function AdminPage() {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newMatch, setNewMatch] = useState({
    homeTeam: "",
    awayTeam: "",
    kickoff: "",
    predictionDeadline: "",
  });

  function loadAll() {
    fetch("/api/admin/deposits")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setDeposits(d.deposits ?? []))
      .catch(() => setError("Admin access only."));
    fetch("/api/admin/withdrawals")
      .then((r) => r.json())
      .then((d) => setWithdrawals(d.withdrawals ?? []));
    fetch("/api/admin/matches")
      .then((r) => r.json())
      .then((d) => setMatches(d.matches ?? []));
  }

  useEffect(loadAll, []);

  async function approveDeposit(id: string) {
    await fetch(`/api/admin/deposits/${id}/approve`, { method: "POST" });
    loadAll();
  }
  async function rejectDeposit(id: string) {
    await fetch(`/api/admin/deposits/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Rejected by admin" }),
    });
    loadAll();
  }
  async function payWithdrawal(id: string) {
    const payoutTxHash = prompt("Payout transaction hash:");
    if (!payoutTxHash) return;
    await fetch(`/api/admin/withdrawals/${id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payoutTxHash }),
    });
    loadAll();
  }
  async function createMatch(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newMatch),
    });
    setNewMatch({ homeTeam: "", awayTeam: "", kickoff: "", predictionDeadline: "" });
    loadAll();
  }
  async function settleMatch(id: string) {
    const home = prompt("Final home score:");
    const away = prompt("Final away score:");
    if (home === null || away === null) return;
    await fetch(`/api/admin/matches/${id}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finalHomeScore: Number(home), finalAwayScore: Number(away) }),
    });
    loadAll();
  }

  if (error) return <p className="text-loss pt-10 text-center">{error}</p>;

  return (
    <div className="pt-6 space-y-6">
      <h1 className="scoreboard text-3xl">ADMIN</h1>

      <section className="card">
        <h2 className="text-sm text-muted uppercase tracking-wide mb-3">Deposits</h2>
        <div className="space-y-3">
          {deposits.map((d) => (
            <div key={d.id} className="border-b border-white/5 pb-2 text-sm">
              <p>
                {d.user.username} · {d.usdtAmount} USDT ({d.network}) →{" "}
                {d.creditsToIssue.toLocaleString()} NGC
              </p>
              <p className="text-xs text-muted break-all">{d.txHash}</p>
              <p className="text-xs">
                Status: <span className="text-brand">{d.status}</span>
              </p>
              {d.status === "PENDING" && (
                <div className="flex gap-2 mt-1">
                  <button onClick={() => approveDeposit(d.id)} className="btn-primary text-xs py-1 px-3">
                    Approve
                  </button>
                  <button onClick={() => rejectDeposit(d.id)} className="btn-secondary text-xs py-1 px-3">
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
          {deposits.length === 0 && <p className="text-muted text-sm">No deposits.</p>}
        </div>
      </section>

      <section className="card">
        <h2 className="text-sm text-muted uppercase tracking-wide mb-3">Withdrawals</h2>
        <div className="space-y-3">
          {withdrawals.map((w) => (
            <div key={w.id} className="border-b border-white/5 pb-2 text-sm">
              <p>
                {w.user.username} · {w.usdtAmount} USDT ({w.network})
              </p>
              <p className="text-xs text-muted break-all">{w.walletAddress}</p>
              <p className="text-xs">
                Status: <span className="text-brand">{w.status}</span>
              </p>
              {w.status === "PENDING" && (
                <button onClick={() => payWithdrawal(w.id)} className="btn-primary text-xs py-1 px-3 mt-1">
                  Mark paid
                </button>
              )}
            </div>
          ))}
          {withdrawals.length === 0 && <p className="text-muted text-sm">No withdrawals.</p>}
        </div>
      </section>

      <section className="card">
        <h2 className="text-sm text-muted uppercase tracking-wide mb-3">Create Match</h2>
        <form onSubmit={createMatch} className="space-y-2">
          <input
            className="input"
            placeholder="Home team"
            value={newMatch.homeTeam}
            onChange={(e) => setNewMatch({ ...newMatch, homeTeam: e.target.value })}
            required
          />
          <input
            className="input"
            placeholder="Away team"
            value={newMatch.awayTeam}
            onChange={(e) => setNewMatch({ ...newMatch, awayTeam: e.target.value })}
            required
          />
          <label className="text-xs text-muted">Kickoff</label>
          <input
            type="datetime-local"
            className="input"
            value={newMatch.kickoff}
            onChange={(e) => setNewMatch({ ...newMatch, kickoff: e.target.value })}
            required
          />
          <label className="text-xs text-muted">Prediction deadline</label>
          <input
            type="datetime-local"
            className="input"
            value={newMatch.predictionDeadline}
            onChange={(e) => setNewMatch({ ...newMatch, predictionDeadline: e.target.value })}
            required
          />
          <button type="submit" className="btn-primary w-full">
            Add match
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="text-sm text-muted uppercase tracking-wide mb-3">Matches</h2>
        <div className="space-y-3">
          {matches.map((m) => (
            <div key={m.id} className="border-b border-white/5 pb-2 text-sm">
              <p>
                {m.homeTeam} vs {m.awayTeam} · {m.status}
              </p>
              {m.status === "UPCOMING" && (
                <button onClick={() => settleMatch(m.id)} className="btn-secondary text-xs py-1 px-3 mt-1">
                  Settle
                </button>
              )}
            </div>
          ))}
          {matches.length === 0 && <p className="text-muted text-sm">No matches.</p>}
        </div>
      </section>
    </div>
  );
}