"use client";
import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getMint,
} from "@solana/spl-token";
import { NGOAT_DEPOSIT_WALLET, USDT_MINT_ADDRESS, NGC_PER_USDT, MIN_DEPOSIT_USDT } from "@/lib/solanaConfig";

export default function BuyNgoatPage() {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const [usdtAmount, setUsdtAmount] = useState(MIN_DEPOSIT_USDT);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const credits = Math.round(usdtAmount * NGC_PER_USDT);

  async function handleBuy() {
    if (!publicKey) return;
    if (usdtAmount < MIN_DEPOSIT_USDT) {
      setStatus(`Minimum purchase is $${MIN_DEPOSIT_USDT}.`);
      return;
    }

    setBusy(true);
    setStatus("Preparing transaction…");
    try {
      const mint = new PublicKey(USDT_MINT_ADDRESS);
      const recipient = new PublicKey(NGOAT_DEPOSIT_WALLET);

      const mintInfo = await getMint(connection, mint);
      const amountRaw = BigInt(Math.round(usdtAmount * 10 ** mintInfo.decimals));

      const senderAta = await getAssociatedTokenAddress(mint, publicKey);
      const recipientAta = await getAssociatedTokenAddress(mint, recipient);

      const tx = new Transaction();
      const recipientAtaInfo = await connection.getAccountInfo(recipientAta);
      if (!recipientAtaInfo) {
        tx.add(createAssociatedTokenAccountInstruction(publicKey, recipientAta, recipient, mint));
      }
      tx.add(createTransferInstruction(senderAta, recipientAta, publicKey, amountRaw));

      setStatus("Waiting for wallet approval…");
      const signature = await sendTransaction(tx, connection);

      setStatus("Confirming on-chain…");
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");

      setStatus("Verifying and crediting NGC…");
      const res = await fetch("/api/deposits/onchain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, usdtAmount, walletAddress: publicKey.toBase58() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus(
          data.error === "ALREADY_CREDITED"
            ? "This transaction was already credited."
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
      <h1 className="scoreboard text-3xl">BUY NGOAT</h1>
      <p className="text-sm text-muted">
        Rate: 1 USDT = {NGC_PER_USDT.toLocaleString()} NGC · Minimum ${MIN_DEPOSIT_USDT}
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
          <label className="text-sm text-muted">USDT amount</label>
          <input
            type="number"
            min={MIN_DEPOSIT_USDT}
            className="input"
            value={usdtAmount}
            onChange={(e) => setUsdtAmount(Number(e.target.value))}
          />
          <p className="text-sm">
            You will receive: <span className="text-brand">{credits.toLocaleString()} NGC</span>
          </p>
          {status && <p className="text-sm text-brand">{status}</p>}
          <button onClick={handleBuy} disabled={busy} className="btn-primary w-full">
            {busy ? "Processing…" : "Buy NGOAT with USDT"}
          </button>
          <p className="text-xs text-muted">
            Your wallet will ask you to approve a USDT transfer on Solana. NGC credits land
            automatically once the transaction is confirmed on-chain — no waiting for admin
            approval.
          </p>
        </div>
      )}
    </div>
  );
}