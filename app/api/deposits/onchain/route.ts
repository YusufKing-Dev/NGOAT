import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { prisma } from "@/lib/prisma";
import { addLedgerEntry, onDepositApproved } from "@/lib/ledger";
import { getCurrentUser } from "@/lib/auth";
import { creditsForAsset } from "@/lib/assetPricing";
import {
  NGOAT_DEPOSIT_WALLET,
  USDT_MINT_ADDRESS,
  NGOAT_MINT_ADDRESS,
  MIN_DEPOSIT_USDT,
  getRpcEndpoint,
  DepositAsset,
} from "@/lib/solanaConfig";

const SPL_MINTS: Record<"USDT" | "NGOAT", string> = {
  USDT: USDT_MINT_ADDRESS,
  NGOAT: NGOAT_MINT_ADDRESS,
};

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const config = await prisma.platformConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
  if (config?.depositsEnabled === false) {
    return NextResponse.json({ error: "DEPOSITS_DISABLED" }, { status: 403 });
  }

  const { signature, asset, amount, walletAddress } = await req.json();
  const depositAsset: DepositAsset = asset === "SOL" || asset === "NGOAT" ? asset : "USDT";

  if (!signature || !amount || !walletAddress) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  // App-level idempotency check (fast path). The DB's unique constraint
  // on txHash is the real guarantee against a double-credit race.
  let already;
  try {
    already = await prisma.depositRequest.findUnique({ where: { txHash: signature } });
  } catch {
    return NextResponse.json({ error: "DB_UNAVAILABLE", signature }, { status: 503 });
  }
  if (already) {
    return NextResponse.json({ error: "ALREADY_CREDITED" }, { status: 400 });
  }

  const connection = new Connection(getRpcEndpoint(), "confirmed");

  let tx;
  try {
    tx = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
  } catch {
    return NextResponse.json({ error: "RPC_LOOKUP_FAILED" }, { status: 502 });
  }
  if (!tx || tx.meta?.err) {
    return NextResponse.json({ error: "TRANSACTION_NOT_FOUND_OR_FAILED" }, { status: 400 });
  }

  const recipient = new PublicKey(NGOAT_DEPOSIT_WALLET);
  let transferredAmount = 0;

  if (depositAsset === "SOL") {
    // Native SOL has no SPL-token instruction to walk — verify by the
    // recipient wallet's own lamport balance delta across the tx. This
    // catches any instruction shape that moves lamports into it
    // (System transfer, transferWithSeed, etc.), not just one specific
    // instruction type.
    const accountKeys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
    const idx = accountKeys.indexOf(recipient.toBase58());
    if (idx === -1 || !tx.meta) {
      return NextResponse.json({ error: "NO_MATCHING_TRANSFER_FOUND" }, { status: 400 });
    }
    const deltaLamports = tx.meta.postBalances[idx] - tx.meta.preBalances[idx];
    if (deltaLamports <= 0) {
      return NextResponse.json({ error: "NO_MATCHING_TRANSFER_FOUND" }, { status: 400 });
    }
    transferredAmount = deltaLamports / 1e9;
  } else {
    const mint = new PublicKey(SPL_MINTS[depositAsset]);
    const recipientAta = (await getAssociatedTokenAddress(mint, recipient)).toBase58();

    let transferredRaw = 0;
    let decimals = 6; // overwritten below if the tx tells us otherwise
    const instructions = (tx.transaction.message.instructions ?? []) as any[];
    for (const ix of instructions) {
      if (ix.program !== "spl-token") continue;
      const parsed = ix.parsed;
      if (!parsed || (parsed.type !== "transfer" && parsed.type !== "transferChecked")) continue;
      const info = parsed.info;
      if (info.destination !== recipientAta) continue;

      if (parsed.type === "transferChecked") {
        transferredRaw += Number(info.tokenAmount.amount);
        decimals = info.tokenAmount.decimals;
      } else {
        transferredRaw += Number(info.amount);
      }
    }

    if (transferredRaw === 0) {
      return NextResponse.json({ error: "NO_MATCHING_TRANSFER_FOUND" }, { status: 400 });
    }
    transferredAmount = transferredRaw / 10 ** decimals;
  }

  if (transferredAmount + 0.000001 < amount) {
    return NextResponse.json(
      { error: "AMOUNT_MISMATCH", onChainAmount: transferredAmount },
      { status: 400 }
    );
  }

  const { credits, usdValue, priceUsed, live } = await creditsForAsset(
    depositAsset,
    transferredAmount,
    config
  );

  if (usdValue < MIN_DEPOSIT_USDT) {
    return NextResponse.json({ error: "BELOW_MIN_DEPOSIT" }, { status: 400 });
  }

  try {
    await prisma.depositRequest.create({
      data: {
        userId: user.id,
        usdtAmount: usdValue,
        asset: depositAsset,
        network: "Solana",
        txHash: signature,
        payoutWalletUsed: NGOAT_DEPOSIT_WALLET,
        creditsToIssue: credits,
        status: "APPROVED",
        autoVerified: true,
        reviewedAt: new Date(),
      },
    });
  } catch {
    // Unique constraint on txHash caught a race.
    return NextResponse.json({ error: "ALREADY_CREDITED" }, { status: 400 });
  }

  await addLedgerEntry({
    userId: user.id,
    type: "DEPOSIT",
    amount: credits,
    description: `On-chain deposit verified: ${transferredAmount} ${depositAsset} (~$${usdValue.toFixed(
      2
    )} @ $${priceUsed}${live ? "" : " fallback rate"})`,
    referencePrefix: "dep",
  });

  await onDepositApproved(user.id, credits);

  return NextResponse.json({ ok: true, creditsIssued: credits, usdValue, priceUsed, live });
}