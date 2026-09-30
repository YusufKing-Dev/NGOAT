"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { bytesToBase64, withdrawalLinkMessage } from "@/lib/walletMessages";

type MeSummary = {
  id: string;
  withdrawalsHeldUntil: string | null;
  walletAddress: string | null;
  realWithdrawableBalance: number;
  staking: { profitAvailable: number };
  withdrawalUnlock: { threshold: number; totalDeposited: number; met: boolean };
};

type Asset = "USDT" | "SOL" | "NGOAT";
const ASSETS: { id: Asset; label: string }[] = [
  { id: "USDT", label: "USDT" },
  { id: "SOL", label: "SOL" },
  { id: "NGOAT", label: "NGOATCOIN" },
];

// Loose sanity check only — NOT a substitute for the person reading
// the warning below. Solana addresses are base58, 32-44 chars.
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export default function WithdrawPage() {
  const { connected, publicKey, signMessage } = useWallet();
  const [usdtAmount, setUsdtAmount] = useState(10);
  const [asset, setAsset] = useState<Asset>("USDT");
  const [source, setSource] = useState<"real" | "staking_profit">("real");
  const [walletInput, setWalletInput] = useState("");
  const [confirmedRisk, setConfirmedRisk] = useState(false);
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

  const linkedWallet = me?.walletAddress ?? null;

  // Once an account has a linked wallet, every future withdrawal MUST
  // use that exact address (enforced server-side too) — so lock the
  // field to it instead of letting someone type a different one and
  // only find out it was rejected after submitting.
  useEffect(() => {
    if (linkedWallet) setWalletInput(linkedWallet);
  }, [linkedWallet]);

  // Connecting a wallet is an optional convenience — it just fills the
  // text field for you so you can't fat-finger a paste. The field
  // itself is always what actually gets submitted.
  useEffect(() => {
    if (connected && publicKey && !linkedWallet) {
      setWalletInput(publicKey.toBase58());
    } else if (!connected && !linkedWallet) {
      setWalletInput("");
    }
  }, [connected, publicKey, linkedWallet]);

  const walletAddress = walletInput.trim();
  const walletLooksValid = SOLANA_ADDRESS_RE.test(walletAddress);
  const walletMismatch = !!linkedWallet && !!walletAddress && linkedWallet !== walletAddress;
  const unlockMet = me?.withdrawalUnlock.met ?? false;
  // Staked Profit only lights up once there's actually released profit
  // to withdraw — i.e. after at least one stake has matured.
  const stakingProfitActive = (me?.staking.profitAvailable ?? 0) > 0;

  const canSubmit =
    !loading &&
    unlockMet &&
    walletLooksValid &&
    !walletMismatch &&
    (!!linkedWallet ||
      (confirmedRisk && connected && !!publicKey && walletAddress === publicKey.toBase58()));

  const heldUntil = me?.withdrawalsHeldUntil ? new Date(me.withdrawalsHeldUntil) : null;
  const onHold = !!heldUntil && heldUntil > new Date();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!walletAddress) return;
    setLoading(true);
    setMessage(null);

    // First withdrawal: the wallet has to prove it's yours by signing a
    // short message (free, moves no funds). Later withdrawals skip this.
    let proof: { walletSignature?: string; signedAt?: number } = {};
    if (!linkedWallet) {
      if (!connected || !publicKey || !signMessage || !me?.id) {
        setMessage(
          "Connect a wallet that can sign messages (like Phantom or Solflare) to link your withdrawal wallet."
        );
        setLoading(false);
        return;
      }
      try {
        const signedAt = Date.now();
        const signature = await signMessage(
          new TextEncoder().encode(withdrawalLinkMessage(me.id, publicKey.toBase58(), signedAt))
        );
        proof = { walletSignature: bytesToBase64(signature), signedAt };
      } catch {
        setMessage("Signature cancelled — your wallet must sign to prove it's yours.");
        setLoading(false);
        return;
      }
    }

    const res = await fetch("/api/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usdtAmount, asset, network: "Solana", walletAddress, source, ...proof }),
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
          "That exceeds your withdrawable balance."
        );
      } else if (data.error === "EXCEEDS_STAKING_PROFIT_BALANCE") {
        setMessage("That exceeds your available Staked Profit.");
      } else if (data.error === "DEPOSIT_REQUIREMENT_NOT_MET") {
        setMessage(data.message ?? "Deposit requirement not met yet.");
      } else if (data.error === "WALLET_ALREADY_LINKED") {
        setMessage("This wallet is already linked to a different account.");
      } else if (data.error === "WITHDRAWALS_HELD") {
        setMessage("Withdrawals are paused for a short time after a password reset. Please try again later.");
      } else if (data.error === "WALLET_PROOF_REQUIRED" || data.error === "WALLET_PROOF_INVALID") {
        setMessage("We couldn't verify that this wallet is yours. Reconnect it and sign the message again.");
      } else if (data.error === "WALLET_PROOF_EXPIRED") {
        setMessage("That signature expired. Please submit again and sign once more.");
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
      <h1 className="scoreboard text-3xl">WITHDRAW</h1>

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
          Minimum $5, maximum $100 per day (combined across both balances and all assets below).
        </p>

        {onHold && heldUntil && (
          <div className="bg-surface2 rounded-lg px-3 py-2 mb-3">
            <p className="text-xs text-loss">
              Withdrawals are paused after your password reset until {heldUntil.toLocaleString()}. This
              protects your account.
            </p>
          </div>
        )}

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

        <p className="text-xs text-muted uppercase tracking-wide mb-2">Withdraw as</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {ASSETS.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={!unlockMet}
              onClick={() => setAsset(a.id)}
              className={
                "rounded-lg py-2 text-sm border " +
                (asset === a.id ? "border-brand text-brand" : "border-white/10 text-muted") +
                (!unlockMet ? " opacity-40" : "")
              }
            >
              {a.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted uppercase tracking-wide mb-2">Payout wallet</p>
        <WalletMultiButton style={{ width: "100%", justifyContent: "center" }} />
        <p className="text-xs text-muted mt-2 mb-1">
          {linkedWallet
            ? "This is the wallet your account is permanently linked to."
            : "Connect the wallet you want to be paid to. It will be asked to sign a free message to prove it's yours — pasting an address is no longer accepted."}
        </p>

        {linkedWallet ? (
          <>
            <input
              type="text"
              className="input mt-1 opacity-70"
              value={walletInput}
              readOnly
            />
            <p className="text-xs text-muted mt-1">
              This is your permanently linked withdrawal wallet — every account can only ever pay out
              to the first wallet it withdrew to. It can't be changed here.
            </p>
          </>
        ) : (
          <input
            type="text"
            placeholder="Connect your wallet above"
            className="input mt-1 opacity-70"
            value={walletInput}
            readOnly
          />
        )}

        {walletAddress && !walletLooksValid && (
          <p className="text-xs text-loss mt-1">That doesn't look like a valid Solana address.</p>
        )}
        {walletMismatch && (
          <p className="text-xs text-loss mt-1">
            This isn't your linked wallet. Your funds can only go to {linkedWallet}.
          </p>
        )}

        <div className="bg-loss/10 border border-loss/40 rounded-lg px-3 py-2 mt-3">
          <p className="text-xs text-loss font-semibold">
            ⚠ Double-check this address before submitting.
          </p>
          <p className="text-xs text-loss mt-1">
            Crypto transfers can't be reversed. If you enter the wrong wallet address — even one
            character off — your funds will be sent there and CANNOT be recovered by you or by us.
            This wallet will also be permanently linked to your account for all future withdrawals.
          </p>
        </div>

        {!linkedWallet && walletLooksValid && (
          <label className="flex items-start gap-2 mt-3 text-xs text-muted">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirmedRisk}
              onChange={(e) => setConfirmedRisk(e.target.checked)}
            />
            I've double-checked this address is correct and understand this can't be undone.
          </label>
        )}

        <form onSubmit={submit} className="space-y-3 mt-4">
          <div>
            <label className="text-sm text-muted">Amount (USD value)</label>
            <input
              type="number"
              min={10}
              max={100}
              className="input mt-1"
              value={usdtAmount}
              onChange={(e) => setUsdtAmount(Number(e.target.value))}
            />
            <p className="text-xs text-muted mt-1">
              You'll be paid the equivalent value in {ASSETS.find((a) => a.id === asset)?.label}.
            </p>
          </div>
          {message && <p className="text-sm text-brand">{message}</p>}
          <button
            type="submit"
            disabled={!canSubmit || onHold}
            className="btn-primary w-full disabled:opacity-40"
          >
            {loading ? "Submitting…" : "SUBMIT WITHDRAWAL REQUEST"}
          </button>
        </form>
        </div>
      )}
    </div>
  );
}