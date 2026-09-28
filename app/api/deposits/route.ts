import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth"; // implement per your auth choice (NextAuth/Lucia)
import { creditsForAsset } from "@/lib/assetPricing";
import { DepositAsset } from "@/lib/solanaConfig";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json();
  const { usdtAmount, asset, network, txHash, payoutWalletUsed } = body;
  const depositAsset: DepositAsset = asset === "SOL" || asset === "NGOAT" ? asset : "USDT";

  if (!usdtAmount || !network || !txHash || !payoutWalletUsed) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  const config = await prisma.platformConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  if (config?.depositsEnabled === false) {
    return NextResponse.json({ error: "DEPOSITS_DISABLED" }, { status: 403 });
  }

  // usdtAmount here is the raw amount of `asset` the user says they
  // sent (e.g. "0.8" SOL) — convert it to its USD-equivalent value
  // before checking it against min/max and before issuing credits.
  // This path is manually reviewed by an admin before approval, so a
  // fallback-priced SOL/NGOAT amount is fine; the admin can verify the
  // real on-chain amount against the tx hash before approving.
  const { credits, usdValue } = await creditsForAsset(depositAsset, usdtAmount, config);

  if (config && (usdValue < config.minDeposit || usdValue > config.maxDeposit)) {
    return NextResponse.json({ error: "AMOUNT_OUT_OF_RANGE" }, { status: 400 });
  }

  const deposit = await prisma.depositRequest.create({
    data: {
      userId: user.id,
      usdtAmount: usdValue,
      asset: depositAsset,
      network,
      txHash,
      payoutWalletUsed,
      creditsToIssue: credits,
      status: "PENDING",
    },
  });

  return NextResponse.json({ deposit });
}