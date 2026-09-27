"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

type MeSummary = {
  walletAddress: string | null;
  realWithdrawableBalance: number;
  staking: { profitAvailable: number };
  withdrawalUnlock: { threshold: number; totalDeposited: number; met: boolean };
};

export default function WithdrawPage() {
  const { connected, publicKey } = useWallet();
  const [usdtAmount, setUsdtAmount] = useState(10);
  const [source, setSource] = useState<"real" | "staking_profit">("real");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<MeSummary | null>(null);
  const [withdrawalsEnabled, setWithdrawalsEnabled] = useState<boolean | null>(null); // null = still loading

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then(setMe);
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setWithdrawalsEnabled(!!d.withdrawalsEnabled));
  }, []);

  const walletAddress = publicKey?.toBase58();
  const linkedWallet = me?.walletAddress ?? null;
  const walletMismatch = linkedWallet && walletAddress && linkedWallet !== walletAddress;
  const unlockMet = me?.withdrawalUnlock.met ?? false;
  // Staked Profit only lights up once there's actually released profit
  // to withdraw — i.e. after at least one stake has matured.
  const stakingProfitActive = (me?.staking.profitAvailable ?? 0) > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!walletAddress) return;
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usdtAmount, network: "Solana", walletAddress, source }),
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
          "That exceeds your Real Balance — your free signup bonus can never be withdrawn, only balance earned on top of it."
        );
      } else if (data.error === "EXCEEDS_STAKING_PROFIT_BALANCE") {
        setMessage("That exceeds your available Staked Profit.");
      } else if (data.error === "DEPOSIT_REQUIREMENT_NOT_MET") {
        setMessage(data.message ?? "Deposit requirement not met yet.");
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
    fetch("/api/me").then((r) => r.json()).then(setMe);
  }

  return (
    <div className="pt-6 space-y-4">
      <h1 className="scoreboard text-3xl">WITHDRAW USDT</h1>

      {withdrawalsEnabled === false && (
        <div className="card">
          <p className="text-sm text-brand font-semibold mb-1">Withdrawals are temporarily closed</p>
          <p className="text-xs text-muted">
            Withdrawals will open once the platform officially launches. Everything you've earned is
            safe and waiting — check back soon.
          </p>
        </div>
      )}

      {withdrawalsEnabled === true && (
        <div className="card">
        <p className="text-xs text-muted mb-3">
          Minimum $5, maximum $100 per day (combined across both balances below).
        </p>

        {me && !unlockMet && (
          <div className="bg-surface2 rounded-lg px-3 py-2 mb-3">
            <p className="text-xs text-brand">
              Deposit at least {me.withdrawalUnlock.threshold.toLocaleString()} NGC to unlock
              withdrawals — you've deposited {me.withdrawalUnlock.totalDeposited.toLocaleString()} NGC
              so far.
            </p>
          </div>
        )}

        <p className="text-xs text-muted uppercase tracking-wide mb-2">Withdraw from</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            disabled={!unlockMet}
            onClick={() => setSource("real")}
            className={
              "rounded-lg py-2 text-sm border " +
              (source === "real" ? "border-brand text-brand" : "border-white/10 text-muted") +
              (!unlockMet ? " opacity-40" : "")
            }
          >
            Real Balance
            <div className="text-xs">{(me?.realWithdrawableBalance ?? 0).toLocaleString()} NGC</div>
          </button>
          <button
            type="button"
            disabled={!unlockMet || !stakingProfitActive}
            onClick={() => setSource("staking_profit")}
            className={
              "rounded-lg py-2 text-sm border " +
              (source === "staking_profit" ? "border-brand text-brand" : "border-white/10 text-muted") +
              (!unlockMet || !stakingProfitActive ? " opacity-40" : "")
            }
          >
            Staked Profit
            <div className="text-xs">{(me?.staking.profitAvailable ?? 0).toLocaleString()} NGC</div>
          </button>
        </div>
        {!stakingProfitActive && (
          <p className="text-xs text-muted -mt-2 mb-3">
            Staked Profit unlocks once your 6-month stake matures and profit is released.
          </p>
        )}

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
                min={10}
                max={100}
                className="input mt-1"
                value={usdtAmount}
                onChange={(e) => setUsdtAmount(Number(e.target.value))}
              />
            </div>
            {message && <p className="text-sm text-brand">{message}</p>}
            <button
              type="submit"
              disabled={loading || !!walletMismatch || !unlockMet}
              className="btn-primary w-full disabled:opacity-40"
            >
              {loading ? "Submitting…" : "SUBMIT WITHDRAWAL REQUEST"}
            </button>
          </form>
        )}
        </div>
      )}
    </div>
  );
}