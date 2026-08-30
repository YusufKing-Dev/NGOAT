"use client";
import { useState } from "react";

export default function WithdrawPage() {
  const [usdtAmount, setUsdtAmount] = useState(10);
  const [network] = useState("Solana");
  const [walletAddress, setWalletAddress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usdtAmount, network, walletAddress }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      if (data.error === "BELOW_MIN_WITHDRAWAL") {
        setMessage(`Minimum withdrawal is $${data.minUsdt}.`);
      } else if (data.error === "DAILY_LIMIT_EXCEEDED") {
        setMessage(
          `Daily withdrawal limit reached. You can withdraw up to $${data.remainingToday?.toFixed(2)} more today.`
        );
      } else if (data.error === "EXCEEDS_WITHDRAWABLE_BALANCE") {
        setMessage(
          "That exceeds your withdrawable balance — your free signup bonus can never be withdrawn, only balance earned on top of it."
        );
      } else {
        setMessage("Something went wrong.");
      }
      return;
    }
    setMessage("Withdrawal requested — pending admin review.");
  }

  return (
    <div className="pt-6 space-y-4">
      <h1 className="scoreboard text-3xl">WITHDRAW USDT</h1>
      <div className="card">
        <p className="text-xs text-muted mb-3">
          Minimum $5, maximum $100 per day. Your free signup bonus never counts toward what you
          can withdraw — only balance earned on top of it does.
        </p>
        <p className="text-xs text-loss mb-4">
          Double-check the wallet address. Funds sent to the wrong address may not be
          recoverable.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-sm text-muted">USDT amount</label>
            <input
              type="number"
              min={5}
              max={100}
              className="input mt-1"
              value={usdtAmount}
              onChange={(e) => setUsdtAmount(Number(e.target.value))}
            />
          </div>
          <input className="input" value="USDT on Solana" disabled />
          <input
            className="input"
            placeholder="Your Solana USDT wallet address"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            required
          />
          {message && <p className="text-sm text-brand">{message}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Submitting…" : "SUBMIT WITHDRAWAL REQUEST"}
          </button>
        </form>
      </div>
    </div>
  );
}