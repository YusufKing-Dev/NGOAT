import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendPasswordChangedNotice } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { hashToken, validateNewPassword, WITHDRAWAL_HOLD_AFTER_RESET_MS } from "@/lib/authTokens";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const newPassword = body.newPassword;

  const withinLimit = await checkRateLimit(getClientIp(req), "reset-password", 10, 15 * 60 * 1000);
  if (!withinLimit) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  if (!token) return NextResponse.json({ error: "INVALID_OR_EXPIRED" }, { status: 400 });
  const pwError = validateNewPassword(newPassword);
  if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });

  const record = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record || record.type !== "PASSWORD_RESET" || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json({ error: "INVALID_OR_EXPIRED" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword as string, 12);
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      // Claim the token first so the same link can't be used twice,
      // even by two simultaneous requests.
      const claimed = await tx.authToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new Error("TOKEN_USED");

      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          passwordChangedAt: now, // signs the account out everywhere else
          // Getting this far proves control of the inbox, so it also
          // counts as verifying the email.
          emailVerified: true,
          verificationToken: null,
          verificationTokenExpiry: null,
          // Withdrawals paused for 24h after a forgot-password reset.
          withdrawalsHeldUntil: new Date(now.getTime() + WITHDRAWAL_HOLD_AFTER_RESET_MS),
        },
      });

      // Any other outstanding reset/change links are now void.
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