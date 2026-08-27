import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { payoutTxHash } = await req.json();
  if (!payoutTxHash) return NextResponse.json({ error: "MISSING_TX_HASH" }, { status: 400 });

  const withdrawal = await prisma.withdrawalRequest.findUnique({ where: { id: params.id } });
  if (!withdrawal) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (withdrawal.status !== "PENDING") {
    return NextResponse.json({ error: "ALREADY_REVIEWED" }, { status: 400 });
  }

  await prisma.withdrawalRequest.update({
    where: { id: withdrawal.id },
    data: { status: "PAID", payoutTxHash, reviewedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
