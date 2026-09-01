"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type MeData = {
  balance: number;
  withdrawableBalance: number;
  stats: { total: number; wins: number; losses: number; winPct: number };
  recent: { id: string; type: string; amount: number; description: string | null; createdAt: string }[];
  referralCode: string | null;
  referralCount: number;
};

export default function DashboardPage() {
  const { status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<MeData | null>(null);
  const [copied, setCopied] = useState(false);

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

  const NGC_PER_USDT = 2000;
  const usdtValue = data.balance / NGC_PER_USDT;
  const withdrawableUsdt = data.withdrawableBalance / NGC_PER_USDT;
  const referralLink =
    data.referralCode && typeof window !== "undefined"
      ? `${window.location.origin}/register?ref=${data.referralCode}`
      : "";

  function copyReferralLink() {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="pt-6 space-y-4">
      <div className="card">
        <p className="text-sm text-muted uppercase tracking-wide mb-1">NGOAT Balance</p>
        <p className="scoreboard text-4xl text-brand">{data.balance.toLocaleString()} NGC</p>
        <p className="text-sm text-muted mt-1">
          ≈ ${usdtValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
          USDT
        </p>
        <div className="mt-3 pt-3 border-t border-white/5">
          <p className="text-xs text-muted uppercase tracking-wide">Withdrawable</p>
          <p className="text-lg font-semibold">
            {data.withdrawableBalance.toLocaleString()} NGC{" "}
            <span className="text-muted text-sm font-normal">
              (≈ $
              {withdrawableUsdt.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
              )
            </span>
          </p>
          <p className="text-xs text-muted mt-1">
            Your free signup bonus is never withdrawable — only balance earned on top of it.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/buy-ngoat" className="btn-primary text-center">
          BUY NGC
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
        <Link href="/stake" className="btn-secondary text-center col-span-2">
          STAKE NGC HERE
        </Link>
      </div>

      <div className="card">
        <p className="text-sm text-muted uppercase tracking-wide mb-2">Refer & Earn</p>
        <p className="text-xs text-muted mb-3">
          Get 2,000 NGC for every friend who registers and verifies their email using your link.
        </p>
        {data.referralCode && (
          <>
            <div className="bg-surface2 rounded-lg px-3 py-2 text-xs break-all mb-2">
              {referralLink}
            </div>
            <button onClick={copyReferralLink} className="btn-secondary w-full text-sm py-2">
              {copied ? "Copied!" : "Copy referral link"}
            </button>
          </>
        )}
        <p className="text-xs text-muted mt-3">
          Referrals so far: <span className="text-brand font-semibold">{data.referralCount}</span>
        </p>
      </div>

      <div className="card">
        <p className="text-sm text-muted uppercase tracking-wide mb-3">Account Stats</p>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-muted">Total accumulators</span>
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