import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Edit a deposit request's details before it's approved (e.g. correct
// the USDT amount or credits to issue). Only allowed while still
// PENDING, so an already-approved/rejected record is never rewritten.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const deposit = await prisma.depositRequest.findUnique({ where: { id: params.id } });
  if (!deposit) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (deposit.status !== "PENDING") {
    return NextResponse.json({ error: "ALREADY_REVIEWED" }, { status: 400 });
  }

  const { usdtAmount, network, txHash, creditsToIssue } = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof usdtAmount === "number" && usdtAmount > 0) data.usdtAmount = usdtAmount;
  if (typeof network === "string" && network.trim()) data.network = network.trim();
  if (typeof txHash === "string" && txHash.trim()) data.txHash = txHash.trim();
  if (typeof creditsToIssue === "number" && creditsToIssue > 0) data.creditsToIssue = Math.trunc(creditsToIssue);

  try {
    const updated = await prisma.depositRequest.update({ where: { id: params.id }, data });
    return NextResponse.json({ ok: true, deposit: updated });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "DUPLICATE_TX_HASH" }, { status: 409 });
    throw e;
  }
}