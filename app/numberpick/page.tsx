"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function NumberPickPage() {
  const { status } = useSession();
  const router = useRouter();
  const [minStake, setMinStake] = useState(10000);
  const [rangeMax, setRangeMax] = useState(30);
  const [jackpotMultiplier, setJackpotMultiplier] = useState(1.8);
  const [goodMultiplier, setGoodMultiplier] = useState(1.2);
  const [smallMultiplier, setSmallMultiplier] = useState(0.8);
  const [enabled, setEnabled] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
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
        setJackpotMultiplier(d.jackpotMultiplier);
        setGoodMultiplier(d.goodMultiplier);
        setSmallMultiplier(d.smallMultiplier);
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

  function toggleNumber(n: number) {
    setSelected((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= 3) return prev; // cap at 3 — ignore further clicks
      return [...prev, n];
    });
  }

  async function enter() {
    if (selected.length !== 3) {
      setError("Pick exactly 3 numbers first.");
      return;
    }
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/games/number-pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numbers: selected, stake }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "BELOW_MIN_STAKE"
            ? `Minimum stake is ${minStake.toLocaleString()} NGC.`
            : data.error === "ALREADY_ENTERED_THIS_WEEK"
            ? "You've already picked your numbers for this week's draw."
            : data.error === "INSUFFICIENT_BALANCE"
            ? "Not enough NGC for that stake."
            : data.error === "GAME_DISABLED"
            ? "Number Pick isn't live yet."
            : data.error === "INVALID_NUMBERS"
            ? "Pick exactly 3 different numbers in range."
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

  function payoutFor(multiplier: number) {
    return Math.round(stake * (1 + multiplier));
  }

  const quickStakes = [minStake, minStake * 2, minStake * 5, minStake * 10];

  return (
    <div className="pt-6 pb-10 space-y-5">
      <div>
        <h1 className="scoreboard text-3xl">NUMBER PICK</h1>
        <p className="text-muted text-sm mt-1">
          Pick 3 numbers from 1–{rangeMax}. One weekly draw reveals its own 3 numbers — match some
          or all of yours to win.
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
            You're in this week with {myEntry.numbers.join(" • ")}, staked{" "}
            {myEntry.stake.toLocaleString()} NGC.
          </p>
          <p className="text-muted text-sm mt-1">Check back after the draw to see if you won.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm text-brand uppercase tracking-wide">Choose 3 numbers</h2>
              <span className="text-xs text-muted">
                {selected.length}/3 selected
              </span>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: rangeMax }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => toggleNumber(n)}
                  disabled={!selected.includes(n) && selected.length >= 3}
                  className={
                    "aspect-square rounded-full text-sm font-semibold border transition disabled:opacity-30 " +
                    (selected.includes(n)
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
            <p className="text-xs text-muted">Minimum {minStake.toLocaleString()} NGC.</p>
          </div>

          <div className="card">
            <h2 className="text-xs text-muted uppercase tracking-wide mb-2">Potential payout</h2>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span>🏆 3/3 — Jackpot</span>
                <span className="text-brand font-semibold">{payoutFor(jackpotMultiplier).toLocaleString()} NGC</span>
              </div>
              <div className="flex justify-between">
                <span>💰 2/3 — Good payout</span>
                <span className="text-brand font-semibold">{payoutFor(goodMultiplier).toLocaleString()} NGC</span>
              </div>
              <div className="flex justify-between">
                <span>🎁 1/3 — Small payout</span>
                <span className="text-brand font-semibold">{payoutFor(smallMultiplier).toLocaleString()} NGC</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>❌ 0/3</span>
                <span>0 NGC</span>
              </div>
            </div>
          </div>

          {error && <p className="text-loss text-sm">{error}</p>}
          {message && <p className="text-brand text-sm">{message}</p>}

          <button
            onClick={enter}
            disabled={busy || !enabled || selected.length !== 3}
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
                  Week of {new Date(r.weekStart).toLocaleDateString()} — winning numbers{" "}
                  <span className="text-ink font-semibold">
                    {(r.winningNumbers ?? []).join(" • ")}
                  </span>
                </span>
                {r.myEntry ? (
                  <span className={r.myEntry.status === "WON" ? "text-brand font-semibold" : "text-muted"}>
                    {r.myEntry.status === "WON"
                      ? `${r.myEntry.matchCount}/3 — +${r.myEntry.payout.toLocaleString()}`
                      : "No win"}
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