import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Edit a withdrawal request's details before it's paid (e.g. correct a
// mistyped wallet address). Only allowed while still PENDING, so a
// paid/rejected record's history is never rewritten.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const withdrawal = await prisma.withdrawalRequest.findUnique({ where: { id: params.id } });
  if (!withdrawal) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (withdrawal.status !== "PENDING") {
    return NextResponse.json({ error: "ALREADY_REVIEWED" }, { status: 400 });
  }

  const { usdtAmount, network, walletAddress } = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof usdtAmount === "number" && usdtAmount > 0) data.usdtAmount = usdtAmount;
  if (typeof network === "string" && network.trim()) data.network = network.trim();
  if (typeof walletAddress === "string" && walletAddress.trim()) data.walletAddress = walletAddress.trim();

  const updated = await prisma.withdrawalRequest.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true, withdrawal: updated });
}