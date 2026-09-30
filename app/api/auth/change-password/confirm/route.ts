import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordChangedNotice } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { hashToken } from "@/lib/authTokens";

export const dynamic = "force-dynamic";

/**
 * Step 2 of "change my password": the emailed link lands on a page that
 * POSTs the token here. No login needed — the link may be opened on a
 * different device than the one that requested the change.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";

  const withinLimit = await checkRateLimit(getClientIp(req), "confirm-password-change", 10, 15 * 60 * 1000);
  if (!withinLimit) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  if (!token) return NextResponse.json({ error: "INVALID_OR_EXPIRED" }, { status: 400 });

  const record = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (
    !record ||
    record.type !== "PASSWORD_CHANGE" ||
    !record.newPasswordHash ||
    record.usedAt ||
    record.expiresAt < new Date()
  ) {
    return NextResponse.json({ error: "INVALID_OR_EXPIRED" }, { status: 400 });
  }

  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.authToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new Error("TOKEN_USED");

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash: record.newPasswordHash as string, passwordChangedAt: now },
      });

      await tx.authToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: now },
      });
    });
  } catch (e: any) {
    if (e?.message === "TOKEN_USED") {
      return NextResponse.json({ error: "INVALID_OR_EXPIRED" }, { status: 400 });
    }
    throw e;
  }

  await sendPasswordChangedNotice(record.user.email);
  return NextResponse.json({ ok: true });
}