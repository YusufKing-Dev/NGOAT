import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { reason } = await req.json().catch(() => ({ reason: undefined }));
  const deposit = await prisma.depositRequest.findUnique({ where: { id: params.id } });
  if (!deposit) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (deposit.status !== "PENDING") {
    return NextResponse.json({ error: "ALREADY_REVIEWED" }, { status: 400 });
  }

  await prisma.depositRequest.update({
    where: { id: deposit.id },
    data: { status: "REJECTED", adminNote: reason, reviewedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
