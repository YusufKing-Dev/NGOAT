"use client";
import { useState } from "react";

export default function WithdrawPage() {
  const [usdtAmount, setUsdtAmount] = useState(10);
  const [network, setNetwork] = useState("TRC20");
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
      if (data.error === "WAGERING_REQUIREMENT_NOT_MET") {
        setMessage(
          `Wager ${data.creditsStillToWager?.toLocaleString()} more NGC before withdrawing.`
        );
      } else if (data.error === "INSUFFICIENT_BALANCE") {
        setMessage("Not enough NGC balance.");
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
        <p className="text-xs text-loss mb-4">
          Double-check the wallet address and network. Funds sent to the wrong network or
          address may not be recoverable.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-sm text-muted">USDT amount</label>
            <input
              type="number"
              min={1}
              className="input mt-1"
              value={usdtAmount}
              onChange={(e) => setUsdtAmount(Number(e.target.value))}
            />
          </div>
          <select className="input" value={network} onChange={(e) => setNetwork(e.target.value)}>
            <option value="TRC20">USDT (TRC20)</option>
            <option value="ERC20">USDT (ERC20)</option>
            <option value="BEP20">USDT (BEP20)</option>
          </select>
          <input
            className="input"
            placeholder="Your USDT wallet address"
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