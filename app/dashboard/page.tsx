"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type MeData = {
  balance: number;
  wageringRequired: number;
  wageringProgress: number;
  stats: { total: number; wins: number; losses: number; winPct: number };
  recent: { id: string; type: string; amount: number; description: string | null; createdAt: string }[];
};

export default function DashboardPage() {
  const { status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<MeData | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated") {
      fetch("/api/me")
        .then((r) => r.json())
        .then(setData);
    }
  }, [status, router]);

  if (status === "loading" || !data) {
    return <p className="text-muted pt-10 text-center">Loading…</p>;
  }

  const wageringLeft = Math.max(data.wageringRequired - data.wageringProgress, 0);

  return (
    <div className="pt-6 space-y-4">
      <div className="card">
        <p className="text-sm text-muted uppercase tracking-wide mb-1">NGOAT Balance</p>
        <p className="scoreboard text-4xl text-brand">{data.balance.toLocaleString()} NGC</p>
        {wageringLeft > 0 && (
          <p className="text-xs text-muted mt-2">
            Wager {wageringLeft.toLocaleString()} more NGC to unlock withdrawals on your free
            bonus.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/buy-ngoat" className="btn-primary text-center">
          BUY NGOAT
        </Link>
        <Link href="/predict" className="btn-secondary text-center">
          MAKE PREDICTION
        </Link>
        <Link href="/withdraw" className="btn-secondary text-center">
          WITHDRAW USDT
        </Link>
        <Link href="/leaderboard" className="btn-secondary text-center">
          LEADERBOARD
        </Link>
      </div>

      <div className="card">
        <p className="text-sm text-muted uppercase tracking-wide mb-3">Account Stats</p>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-muted">Total predictions</span>
          <span className="text-right">{data.stats.total}</span>
          <span className="text-muted">Wins</span>
          <span className="text-right text-win">{data.stats.wins}</span>
          <span className="text-muted">Losses</span>
          <span className="text-right text-loss">{data.stats.losses}</span>
          <span className="text-muted">Win %</span>
          <span className="text-right">{data.stats.winPct}%</span>
        </div>
      </div>

      <div className="card">
        <p className="text-sm text-muted uppercase tracking-wide mb-3">Recent Activity</p>
        <div className="space-y-2">
          {data.recent.length === 0 && <p className="text-sm text-muted">No activity yet.</p>}
          {data.recent.map((e) => (
            <div key={e.id} className="flex justify-between text-sm border-b border-white/5 pb-2">
              <span className="text-muted">{e.description ?? e.type}</span>
              <span className={e.amount >= 0 ? "text-win" : "text-loss"}>
                {e.amount >= 0 ? "+" : ""}
                {e.amount.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}