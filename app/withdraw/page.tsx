"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export default function WithdrawPage() {
  const { connected, publicKey } = useWallet();
  const [usdtAmount, setUsdtAmount] = useState(10);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [linkedWallet, setLinkedWallet] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setLinkedWallet(d.walletAddress ?? null));
  }, []);

  const walletAddress = publicKey?.toBase58();
  const walletMismatch = linkedWallet && walletAddress && linkedWallet !== walletAddress;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!walletAddress) return;
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usdtAmount, network: "Solana", walletAddress }),
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
      } else if (data.error === "WALLET_ALREADY_LINKED") {
        setMessage("This wallet is already linked to a different account.");
      } else if (data.error === "WALLET_MISMATCH") {
        setMessage(`You must withdraw using your linked wallet: ${data.linkedWallet}`);
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
        <p className="text-xs text-brand mb-4">
          One wallet per account: the first wallet you connect here becomes permanently linked to
          your account — you'll always withdraw to that same wallet going forward.
        </p>

        <p className="text-xs text-muted uppercase tracking-wide mb-2">Connect wallet</p>
        <WalletMultiButton style={{ width: "100%", justifyContent: "center" }} />
        {connected && walletAddress && (
          <p className="text-xs text-muted mt-2 break-all">Connected: {walletAddress}</p>
        )}
        {walletMismatch && (
          <p className="text-xs text-loss mt-2">
            This isn't your linked wallet. Connect {linkedWallet} instead.
          </p>
        )}

        {connected && (
          <form onSubmit={submit} className="space-y-3 mt-4">
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
            {message && <p className="text-sm text-brand">{message}</p>}
            <button
              type="submit"
              disabled={loading || !!walletMismatch}
              className="btn-primary w-full disabled:opacity-40"
            >
              {loading ? "Submitting…" : "SUBMIT WITHDRAWAL REQUEST"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}