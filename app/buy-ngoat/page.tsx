"use client";
import { useState } from "react";

const RATE = 2000; // NGC per USDT
const DEPOSIT_WALLET = "9hKZyLjGB77gzVB1sajaphpPe5r9RHi1yFLYWHm9eyj"; // placeholder — pull from /api/config in a real build

export default function BuyNgoatPage() {
  const [usdtAmount, setUsdtAmount] = useState(10);
  const [network, setNetwork] = useState("TRC20");
  const [txHash, setTxHash] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const credits = Math.round(usdtAmount * RATE);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/deposits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usdtAmount,
        network,
        txHash,
        payoutWalletUsed: DEPOSIT_WALLET,
      }),
    });
    setLoading(false);
    setMessage(res.ok ? "Submitted — pending admin verification." : "Something went wrong.");
    if (res.ok) setTxHash("");
  }

  return (
    <div className="pt-6 space-y-4">
      <h1 className="scoreboard text-3xl">BUY NGOAT</h1>
      <p className="text-sm text-muted">Rate: 1 USDT = {RATE.toLocaleString()} NGC</p>

      <div className="card">
        <label className="text-sm text-muted">USDT amount</label>
        <input
          type="number"
          min={1}
          className="input mt-1 mb-3"
          value={usdtAmount}
          onChange={(e) => setUsdtAmount(Number(e.target.value))}
        />
        <p className="text-sm mb-4">
          You will receive: <span className="text-brand">{credits.toLocaleString()} NGC</span>
        </p>

        <p className="text-xs text-muted mb-1">Send to (network: {network})</p>
        <div className="bg-surface2 rounded-lg px-3 py-2 text-sm break-all mb-4">
          {DEPOSIT_WALLET}
        </div>

        <form onSubmit={submit} className="space-y-3">
          <select
            className="input"
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
          >
            <option value="TRC20">USDT (TRC20)</option>
            <option value="ERC20">USDT (ERC20)</option>
            <option value="BEP20">USDT (BEP20)</option>
          </select>
          <input
            className="input"
            placeholder="Transaction hash"
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            required
          />
          {message && <p className="text-sm text-brand">{message}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Submitting…" : "SUBMIT PAYMENT"}
          </button>
        </form>
      </div>
    </div>
  );
}