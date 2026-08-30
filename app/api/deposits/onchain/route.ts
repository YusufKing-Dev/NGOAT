import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { prisma } from "@/lib/prisma";
import { addLedgerEntry } from "@/lib/ledger";
import { getCurrentUser } from "@/lib/auth";
import {
  NGOAT_DEPOSIT_WALLET,
  USDT_MINT_ADDRESS,
  NGC_PER_USDT,
  MIN_DEPOSIT_USDT,
  getRpcEndpoint,
} from "@/lib/solanaConfig";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { signature, usdtAmount, walletAddress } = await req.json();
  if (!signature || !usdtAmount || !walletAddress) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }
  if (usdtAmount < MIN_DEPOSIT_USDT) {
    return NextResponse.json({ error: "BELOW_MIN_DEPOSIT" }, { status: 400 });
  }

  // App-level idempotency check (fast path). The DB's unique constraint
  // on txHash is the real guarantee against a double-credit race.
  const already = await prisma.depositRequest.findUnique({ where: { txHash: signature } });
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

  const mint = new PublicKey(USDT_MINT_ADDRESS);
  const recipient = new PublicKey(NGOAT_DEPOSIT_WALLET);
  const recipientAta = (await getAssociatedTokenAddress(mint, recipient)).toBase58();

  // Walk the transaction's parsed instructions for an SPL-token
  // transfer that actually landed in the platform's USDT token
  // account — this is what makes the credit trustworthy, not just the
  // claimed amount from the client.
  let transferredRaw = 0;
  let decimals = 6; // USDT's standard SPL decimals — overwritten below if the tx tells us otherwise
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

  const transferredUsdt = transferredRaw / 10 ** decimals;
  if (transferredUsdt + 0.000001 < usdtAmount) {
    return NextResponse.json(
      { error: "AMOUNT_MISMATCH", onChainAmount: transferredUsdt },
      { status: 400 }
    );
  }

  const creditsToIssue = Math.round(transferredUsdt * NGC_PER_USDT);

  try {
    await prisma.depositRequest.create({
      data: {
        userId: user.id,
        usdtAmount: transferredUsdt,
        network: "Solana",
        txHash: signature,
        payoutWalletUsed: NGOAT_DEPOSIT_WALLET,
        creditsToIssue,
        status: "APPROVED",
        autoVerified: true,
        reviewedAt: new Date(),
      },
    });
  } catch {
    // Unique constraint on txHash caught a race — someone else's
    // request (or a retry) already credited this exact transaction.
    return NextResponse.json({ error: "ALREADY_CREDITED" }, { status: 400 });
  }

  await addLedgerEntry({
    userId: user.id,
    type: "DEPOSIT",
    amount: creditsToIssue,
    description: `On-chain deposit verified: ${transferredUsdt} USDT`,
    referencePrefix: "dep",
  });

  return NextResponse.json({ ok: true, creditsIssued: creditsToIssue });
}