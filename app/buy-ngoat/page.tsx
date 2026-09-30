"use client";
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { bytesToBase64, depositProofMessage } from "@/lib/walletMessages";
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getMint,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import {
  NGOAT_DEPOSIT_WALLET,
  USDT_MINT_ADDRESS,
  NGOAT_MINT_ADDRESS,
  MIN_DEPOSIT_USDT,
  DepositAsset,
} from "@/lib/solanaConfig";

const ASSETS: { id: DepositAsset; label: string }[] = [
  { id: "USDT", label: "USDT" },
  { id: "SOL", label: "SOL" },
  { id: "NGOAT", label: "NGOATCOIN" },
];

const SPL_MINTS: Record<"USDT" | "NGOAT", string> = {
  USDT: USDT_MINT_ADDRESS,
  NGOAT: NGOAT_MINT_ADDRESS,
};

export default function BuyNgoatPage() {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction, signMessage } = useWallet();
  const [asset, setAsset] = useState<DepositAsset>("USDT");
  const [usdAmount, setUsdAmount] = useState(MIN_DEPOSIT_USDT);
  const [quote, setQuote] = useState<{ price: number; live: boolean; ngcPerUsd: number } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Live price quote — re-fetched whenever the chosen asset changes,
  // so the "you'll receive" estimate matches what the server will
  // actually price the deposit at (live Jupiter price, or the admin
  // fallback rate if Jupiter has none — see lib/assetPricing.ts).
  useEffect(() => {
    let cancelled = false;
    setQuoteLoading(true);
    fetch(`/api/price?asset=${asset}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setQuote(d);
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asset]);

  const credits = quote ? Math.round(usdAmount * quote.ngcPerUsd) : null;
  // How much of the chosen asset this USD amount actually costs right
  // now — this exact number (not usdAmount) is what gets sent
  // on-chain and what the wallet's approval popup will show.
  const assetAmount = quote && quote.price > 0 ? usdAmount / quote.price : null;

  async function handleBuy() {
    if (!publicKey || !assetAmount || !quote) return;
    if (usdAmount < MIN_DEPOSIT_USDT) {
      setStatus(`Minimum purchase is $${MIN_DEPOSIT_USDT}.`);
      return;
    }

    setBusy(true);
    setStatus("Preparing transaction…");
    try {
      const recipient = new PublicKey(NGOAT_DEPOSIT_WALLET);
      const tx = new Transaction();
      let onChainAmount = assetAmount; // amount actually sent, in asset units (not USD)

      if (asset === "SOL") {
        const lamports = Math.round(assetAmount * LAMPORTS_PER_SOL);

        const balance = await connection.getBalance(publicKey);
        // Leave a little headroom for the network fee (~5000 lamports)
        // on top of the transfer itself, so the tx doesn't fail
        // wallet-side simulation for a razor-thin balance.
        if (balance < lamports + 5000) {
          setStatus(
            `Insufficient SOL balance — this wallet has ${(balance / LAMPORTS_PER_SOL).toFixed(
              4
            )} SOL, need ~${(assetAmount).toFixed(4)} SOL plus network fees.`
          );
          setBusy(false);
          return;
        }

        tx.add(SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: recipient, lamports }));
        onChainAmount = lamports / LAMPORTS_PER_SOL;
      } else {
        const mint = new PublicKey(SPL_MINTS[asset]);
        const mintInfo = await getMint(connection, mint);
        const amountRaw = BigInt(Math.round(assetAmount * 10 ** mintInfo.decimals));

        const senderAta = await getAssociatedTokenAddress(mint, publicKey);
        const recipientAta = await getAssociatedTokenAddress(mint, recipient);

        // Pre-flight check: does this wallet actually hold the token?
        // A wallet that's never held it has no token account at all,
        // and a raw transfer instruction against a missing account
        // fails wallet-side simulation with a cryptic error. Catching
        // it here lets us show the real reason instead of "Something
        // went wrong."
        let senderBalanceRaw = BigInt(0);
        try {
          const senderAccount = await getAccount(connection, senderAta);
          senderBalanceRaw = senderAccount.amount;
        } catch (e) {
          if (e instanceof TokenAccountNotFoundError) {
            setStatus(
              `This wallet has no ${asset} token account — you need ${asset} on Solana in this wallet first.`
            );
            setBusy(false);
            return;
          }
          throw e;
        }

        if (senderBalanceRaw < amountRaw) {
          const have = Number(senderBalanceRaw) / 10 ** mintInfo.decimals;
          setStatus(`Insufficient ${asset} balance — this wallet has ${have}, need ~${assetAmount}.`);
          setBusy(false);
          return;
        }

        const recipientAtaInfo = await connection.getAccountInfo(recipientAta);
        if (!recipientAtaInfo) {
          tx.add(createAssociatedTokenAccountInstruction(publicKey, recipientAta, recipient, mint));
        }
        tx.add(createTransferInstruction(senderAta, recipientAta, publicKey, amountRaw));
        onChainAmount = Number(amountRaw) / 10 ** mintInfo.decimals;
      }

      // Prove this wallet is yours BEFORE any money moves, by signing a
      // free message. The server later checks that this same wallet is
      // the one that sent the deposit.
      if (!signMessage) {
        setStatus(
          "This wallet can't sign messages, which is needed to verify your deposit. Please use Phantom or Solflare."
        );
        setBusy(false);
        return;
      }
      setStatus("Sign the free message in your wallet to verify it's yours…");
      const meRes = await fetch("/api/me");
      const me = await meRes.json();
      if (!meRes.ok || !me?.id) {
        setStatus("Please log in again and retry.");
        setBusy(false);
        return;
      }
      const signedAt = Date.now();
      const proofBytes = await signMessage(
        new TextEncoder().encode(depositProofMessage(me.id, publicKey.toBase58(), signedAt))
      );
      const walletSignature = bytesToBase64(proofBytes);

      setStatus("Waiting for wallet approval…");
      const signature = await sendTransaction(tx, connection);

      setStatus("Confirming on-chain…");
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");

      setStatus("Verifying and crediting NGC…");
      const res = await fetch("/api/deposits/onchain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature,
          asset,
          amount: onChainAmount,
          walletAddress: publicKey.toBase58(),
          walletSignature,
          signedAt,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus(
          data.error === "ALREADY_CREDITED"
            ? "This transaction was already credited."
            : data.error === "SENDER_MISMATCH" || data.error === "WALLET_PROOF_INVALID"
            ? "This deposit doesn't match the wallet that signed. Contact support with your transaction signature: " + signature
            : "Verification failed — contact support with your transaction signature: " + signature
        );
      } else {
        setStatus(`Success! ${data.creditsIssued.toLocaleString()} NGC credited.`);
      }
    } catch (e: any) {
      setStatus(
        e?.message?.includes("User rejected") || e?.message?.includes("rejected")
          ? "Transaction cancelled."
          : "Something went wrong. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-6 space-y-4">
      <h1 className="scoreboard text-3xl">BUY NGC</h1>
      <p className="text-sm text-muted">
        Minimum ${MIN_DEPOSIT_USDT} · Pay with USDT, SOL, or NGOATCOIN — priced live in USD
      </p>

      <div className="card">
        <p className="text-xs text-brand uppercase tracking-wide mb-2">Connect wallet</p>
        <WalletMultiButton style={{ width: "100%", justifyContent: "center" }} />
        {connected && publicKey && (
          <p className="text-xs text-muted mt-2 break-all">Connected: {publicKey.toBase58()}</p>
        )}
      </div>

      {connected && (
        <div className="card space-y-3">
          <p className="text-xs text-muted uppercase tracking-wide">Pay with</p>
          <div className="grid grid-cols-3 gap-2">
            {ASSETS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAsset(a.id)}
                className={
                  "rounded-lg py-2 text-sm border " +
                  (asset === a.id ? "border-brand text-brand" : "border-white/10 text-muted")
                }
              >
                {a.label}
              </button>
            ))}
          </div>

          <label className="text-sm text-muted">Amount (USD value)</label>
          <input
            type="number"
            min={MIN_DEPOSIT_USDT}
            className="input"
            value={usdAmount}
            onChange={(e) => setUsdAmount(Number(e.target.value))}
          />

          {quoteLoading && <p className="text-xs text-muted">Fetching live price…</p>}
          {!quoteLoading && quote && assetAmount !== null && (
            <p className="text-xs text-muted">
              ≈ {assetAmount.toFixed(6)} {asset} at ${quote.price} / {asset}
              {!quote.live && " (fallback rate — live price unavailable right now)"}
            </p>
          )}

          <p className="text-sm">
            You will receive:{" "}
            <span className="text-brand">
              {credits !== null ? credits.toLocaleString() : "—"} NGC
            </span>
          </p>

          {status && <p className="text-sm text-brand">{status}</p>}
          <button
            onClick={handleBuy}
            disabled={busy || quoteLoading || !quote}
            className="btn-primary w-full disabled:opacity-40"
          >
            {busy ? "Processing…" : `Buy NGC with ${asset}`}
          </button>
          <p className="text-xs text-muted">
            Your wallet will ask you to approve a transfer on Solana for the exact amount shown above.
            NGC credits land automatically once the transaction is confirmed on-chain — no waiting for
            admin approval.
          </p>
        </div>
      )}
    </div>
  );
}