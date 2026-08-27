import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addLedgerEntry } from "@/lib/ledger";
import { requireAdmin } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const deposit = await prisma.depositRequest.findUnique({ where: { id: params.id } });
  if (!deposit) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (deposit.status !== "PENDING") {
    return NextResponse.json({ error: "ALREADY_REVIEWED" }, { status: 400 });
  }

  // NOTE: for production, verify txHash on-chain via a block explorer API
  // here before approving, rather than trusting the submitted hash alone.

  await prisma.$transaction([
    prisma.depositRequest.update({
      where: { id: deposit.id },
      data: { status: "APPROVED", reviewedAt: new Date() },
    }),
  ]);

  await addLedgerEntry({
    userId: deposit.userId,
    type: "DEPOSIT",
    amount: deposit.creditsToIssue,
    description: `Deposit approved: ${deposit.usdtAmount} USDT on ${deposit.network}`,
    referencePrefix: "dep",
  });

  return NextResponse.json({ ok: true });
}
