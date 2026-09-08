"use client";
import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, Transaction, SendTransactionError } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getMint,
  TokenAccountNotFoundError,
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

      // Pre-flight check: does this wallet actually hold USDT? A wallet
      // that has never held USDT has no token account for it at all, and
      // a raw transfer instruction against a missing/underfunded account
      // fails wallet-side simulation with a cryptic error. Catching it
      // here lets us show the real reason instead of "Something went wrong."
      let senderBalanceRaw = BigInt(0);
      try {
        const senderAccount = await getAccount(connection, senderAta);
        senderBalanceRaw = senderAccount.amount;
      } catch (e) {
        if (e instanceof TokenAccountNotFoundError) {
          setStatus("This wallet has no USDT token account — you need USDT on Solana in this wallet first.");
          setBusy(false);
          return;
        }
        throw e;
      }

      if (senderBalanceRaw < amountRaw) {
        const have = Number(senderBalanceRaw) / 10 ** mintInfo.decimals;
        setStatus(`Insufficient USDT balance — this wallet has ${have} USDT, need ${usdtAmount}.`);
        setBusy(false);
        return;
      }

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
      // Always log the real error for environments where a console is
      // reachable (desktop browser). On mobile, inside Phantom's in-app
      // browser, there's no dev console available at all — so the
      // status message below has to carry the real diagnostic itself.
      console.error("Buy NGC failed:", e);

      // SendTransactionError (thrown by sendTransaction/simulation
      // failures) carries the actual on-chain simulation logs, which
      // are far more useful than the generic wrapper message — e.g.
      // "insufficient funds", "invalid account data", a specific
      // program error code, etc.
      let detail = "";
      if (e instanceof SendTransactionError) {
        try {
          const logs = await e.getLogs(connection);
          if (logs && logs.length) detail = logs.join(" | ");
        } catch {
          // ignore — fall through to generic message extraction below
        }
      }

      if (!detail) {
        if (typeof e === "string") detail = e;
        else if (e?.message) detail = e.message;
        else if (e?.error?.message) detail = e.error.message;
        else if (e?.name) detail = e.name;
        else {
          try {
            detail = JSON.stringify(e);
          } catch {
            detail = String(e);
          }
        }
      }

      const msg = (detail || "").toLowerCase();
      if (msg.includes("user rejected") || msg.includes("rejected")) {
        setStatus("Transaction cancelled.");
      } else if (msg.includes("insufficient")) {
        setStatus(`Insufficient balance to cover this purchase and network fees. (${detail})`);
      } else if (msg.includes("blockhash not found") || msg.includes("expired")) {
        setStatus("Transaction expired before it was confirmed. Please try again.");
      } else if (msg.includes("429") || msg.includes("rate")) {
        setStatus("The network is rate-limiting requests right now. Please wait a moment and try again.");
      } else {
        setStatus(`Something went wrong: ${detail || "no error details available"}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-6 space-y-4">
      <h1 className="scoreboard text-3xl">BUY NGC</h1>
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
            {busy ? "Processing…" : "Buy NGC with USDT"}
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
