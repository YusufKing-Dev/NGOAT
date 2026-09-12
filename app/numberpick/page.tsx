"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function NumberPickPage() {
  const { status } = useSession();
  const router = useRouter();
  const [minStake, setMinStake] = useState(10000);
  const [rangeMax, setRangeMax] = useState(50);
  const [rewardMultiplier, setRewardMultiplier] = useState(1.8);
  const [enabled, setEnabled] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [stake, setStake] = useState(10000);
  const [myEntry, setMyEntry] = useState<any>(null);
  const [drawAt, setDrawAt] = useState<string | null>(null);
  const [recentResults, setRecentResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/games/number-pick")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        setMinStake(d.minStake);
        setRangeMax(d.rangeMax);
        setRewardMultiplier(d.rewardMultiplier);
        setEnabled(d.enabled);
        setMyEntry(d.myEntryThisWeek);
        setDrawAt(d.currentDraw?.drawAt ?? null);
        setRecentResults(d.recentResults ?? []);
        setStake((s) => (s < d.minStake ? d.minStake : s));
      });
  }

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated") load();
  }, [status, router]);

  async function enter() {
    if (!selected) {
      setError("Pick a number first.");
      return;
    }
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/games/number-pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: selected, stake }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "BELOW_MIN_STAKE"
            ? `Minimum stake is ${minStake.toLocaleString()} NGC.`
            : data.error === "ALREADY_ENTERED_THIS_WEEK"
            ? "You've already picked a number for this week's draw."
            : data.error === "INSUFFICIENT_BALANCE"
            ? "Not enough NGC for that stake."
            : data.error === "GAME_DISABLED"
            ? "Number Pick isn't live yet."
            : "Something went wrong."
        );
        setBusy(false);
        return;
      }
      setMessage("You're in! Good luck in this week's draw.");
      load();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const potentialPayout = Math.round(stake * (1 + rewardMultiplier));
  const quickStakes = [minStake, minStake * 2, minStake * 5, minStake * 10, minStake * 20];

  return (
    <div className="pt-6 pb-10 space-y-5">
      <div>
        <h1 className="scoreboard text-3xl">NUMBER PICK</h1>
        <p className="text-muted text-sm mt-1">
          One draw a week — pick your number, everyone who matches the draw wins.
        </p>
        {drawAt && (
          <p className="text-xs text-muted mt-1">
            This week's draw reveals {new Date(drawAt).toLocaleString()}
          </p>
        )}
      </div>

      {myEntry ? (
        <div className="card">
          <p className="text-brand font-semibold">
            You're in this week with number {myEntry.number}, staked {myEntry.stake.toLocaleString()} NGC.
          </p>
          <p className="text-muted text-sm mt-1">Check back after the draw to see if you won.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm text-brand uppercase tracking-wide">Choose a number</h2>
              <span className="text-xs text-muted">1–{rangeMax}</span>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: rangeMax }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setSelected(n)}
                  className={
                    "aspect-square rounded-full text-sm font-semibold border transition " +
                    (selected === n
                      ? "bg-brand border-brand text-white"
                      : "bg-surface2 border-white/10 text-ink hover:border-brand/60")
                  }
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="card space-y-3">
            <h2 className="text-sm text-brand uppercase tracking-wide">Stake NGC</h2>
            <input
              type="number"
              className="input"
              min={minStake}
              step={1000}
              value={stake}
              onChange={(e) => setStake(Number(e.target.value))}
            />
            <div className="flex flex-wrap gap-2">
              {quickStakes.map((s) => (
                <button
                  key={s}
                  onClick={() => setStake(s)}
                  className={
                    "text-xs px-3 py-1.5 rounded-full border " +
                    (stake === s
                      ? "bg-brand border-brand text-white"
                      : "border-white/10 text-muted hover:text-ink")
                  }
                >
                  {s.toLocaleString()}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">
              Minimum {minStake.toLocaleString()} NGC. If your number is drawn, you receive{" "}
              <span className="text-brand font-semibold">{potentialPayout.toLocaleString()} NGC</span>{" "}
              ({(1 + rewardMultiplier) % 1 === 0
                ? (1 + rewardMultiplier).toFixed(0)
                : (1 + rewardMultiplier).toFixed(1)}
              × your stake).
            </p>
          </div>

          {error && <p className="text-loss text-sm">{error}</p>}
          {message && <p className="text-brand text-sm">{message}</p>}

          <button
            onClick={enter}
            disabled={busy || !enabled}
            className="btn-primary w-full py-3 rounded-full text-base"
          >
            {busy ? "Entering…" : "ENTER THIS WEEK'S DRAW"}
          </button>
        </>
      )}

      {recentResults.length > 0 && (
        <div className="card">
          <h2 className="text-xs text-muted uppercase tracking-wide mb-2">Past draws</h2>
          <div className="space-y-2 text-sm">
            {recentResults.map((r, i) => (
              <div key={i} className="flex justify-between border-b border-white/5 pb-1.5 last:border-0">
                <span className="text-muted">
                  Week of {new Date(r.weekStart).toLocaleDateString()} — winning number{" "}
                  <span className="text-ink font-semibold">{r.winningNumber}</span>
                </span>
                {r.myEntry ? (
                  <span className={r.myEntry.status === "WON" ? "text-brand font-semibold" : "text-muted"}>
                    {r.myEntry.status === "WON" ? `+${r.myEntry.payout.toLocaleString()}` : "No win"}
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}