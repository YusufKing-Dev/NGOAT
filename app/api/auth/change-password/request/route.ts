import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { sendPasswordChangeConfirmEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/security";
import { hashToken, newRawToken, RESET_TOKEN_TTL_MS, TOKEN_EMAIL_COOLDOWN_MS, validateNewPassword } from "@/lib/authTokens";

export const dynamic = "force-dynamic";

/**
 * Step 1 of "change my password" for a logged-in user. Checks the current
 * password, stores the NEW password (already hashed) against a one-time
 * token, and emails a confirmation link. Nothing changes until that link
 * is confirmed — the old password keeps working until then.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { currentPassword, newPassword } = body;
  if (typeof currentPassword !== "string" || !currentPassword) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const pwError = validateNewPassword(newPassword);
  if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });

  // Limits guessing of the current password from a hijacked session.
  const withinLimit = await checkRateLimit(user.id, "change-password", 5, 60 * 60 * 1000);
  if (!withinLimit) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  if (!(await bcrypt.compare(currentPassword, dbUser.passwordHash))) {
    return NextResponse.json({ error: "WRONG_PASSWORD" }, { status: 400 });
  }
  if (await bcrypt.compare(newPassword as string, dbUser.passwordHash)) {
    return NextResponse.json({ error: "SAME_PASSWORD" }, { status: 400 });
  }

  const last = await prisma.authToken.findFirst({
    where: { userId: user.id, type: "PASSWORD_CHANGE" },
    orderBy: { createdAt: "desc" },
  });
  if (last && Date.now() - last.createdAt.getTime() < TOKEN_EMAIL_COOLDOWN_MS) {
    return NextResponse.json({ error: "TOO_SOON" }, { status: 429 });
  }

  const raw = newRawToken();
  const newPasswordHash = await bcrypt.hash(newPassword as string, 12);
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId: user.id, type: "PASSWORD_CHANGE", usedAt: null } }),
    prisma.authToken.create({
      data: {
        userId: user.id,
        type: "PASSWORD_CHANGE",
        tokenHash: hashToken(raw),
        newPasswordHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    }),
  ]);

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  await sendPasswordChangeConfirmEmail(dbUser.email, `${baseUrl}/confirm-password-change?token=${raw}`);

  return NextResponse.json({ ok: true });
}