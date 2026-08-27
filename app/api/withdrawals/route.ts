import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBalance, isWithdrawalEligible } from "@/lib/ledger";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { usdtAmount, network, walletAddress } = await req.json();
  if (!usdtAmount || !network || !walletAddress) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  const eligible = await isWithdrawalEligible(user.id);
  if (!eligible) {
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    const remaining = (dbUser?.bonusWageringRequired ?? 0) - (dbUser?.bonusWageringProgress ?? 0);
    return NextResponse.json(
      {
        error: "WAGERING_REQUIREMENT_NOT_MET",
        creditsStillToWager: Math.max(remaining, 0),
      },
      { status: 400 }
    );
  }

  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const rate = config?.usdtToCreditsRate ?? 2000;
  const creditsNeeded = Math.round(usdtAmount * rate);

  const balance = await getBalance(user.id);
  if (balance < creditsNeeded) {
    return NextResponse.json({ error: "INSUFFICIENT_BALANCE" }, { status: 400 });
  }

  // Lock the credits immediately so they can't be spent while pending.
  // (Reuses debitWithCheck pattern — import kept local to avoid a
  // circular import here; wire this to lib/ledger.ts's debitWithCheck
  // with type REDEMPTION in the same way app/api/predictions does.)
  const { debitWithCheck } = await import("@/lib/ledger");
  await debitWithCheck({
    userId: user.id,
    type: "REDEMPTION",
    amount: creditsNeeded,
    description: `Withdrawal request: ${usdtAmount} USDT to ${network}`,
    referencePrefix: "wd",
  });

  const withdrawal = await prisma.withdrawalRequest.create({
    data: { userId: user.id, usdtAmount, network, walletAddress, status: "PENDING" },
  });

  return NextResponse.json({ withdrawal });
}
