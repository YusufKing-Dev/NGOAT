import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth"; // implement per your auth choice (NextAuth/Lucia)

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json();
  const { usdtAmount, network, txHash, payoutWalletUsed } = body;

  if (!usdtAmount || !network || !txHash || !payoutWalletUsed) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const rate = config?.usdtToCreditsRate ?? 1000;

  if (config && (usdtAmount < config.minDeposit || usdtAmount > config.maxDeposit)) {
    return NextResponse.json({ error: "AMOUNT_OUT_OF_RANGE" }, { status: 400 });
  }

  const deposit = await prisma.depositRequest.create({
    data: {
      userId: user.id,
      usdtAmount,
      network,
      txHash,
      payoutWalletUsed,
      creditsToIssue: Math.round(usdtAmount * rate),
      status: "PENDING",
    },
  });

  return NextResponse.json({ deposit });
}
