import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { hashToken, newRawToken, RESET_TOKEN_TTL_MS, TOKEN_EMAIL_COOLDOWN_MS } from "@/lib/authTokens";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) return NextResponse.json({ error: "MISSING_EMAIL" }, { status: 400 });

  // Per-IP cap so this form can't be used to spam anyone's inbox.
  const withinLimit = await checkRateLimit(getClientIp(req), "forgot-password", 5, 60 * 60 * 1000);
  if (!withinLimit) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  // Identical response whether or not the account exists, so this can't
  // be used to find out which emails are registered.
  if (user && !user.suspended) {
    const last = await prisma.authToken.findFirst({
      where: { userId: user.id, type: "PASSWORD_RESET" },
      orderBy: { createdAt: "desc" },
    });
    const tooSoon = last && Date.now() - last.createdAt.getTime() < TOKEN_EMAIL_COOLDOWN_MS;

    if (!tooSoon) {
      const raw = newRawToken();
      await prisma.$transaction([
        // Only the newest link is valid.
        prisma.authToken.deleteMany({ where: { userId: user.id, type: "PASSWORD_RESET", usedAt: null } }),
        prisma.authToken.create({
          data: {
            userId: user.id,
            type: "PASSWORD_RESET",
            tokenHash: hashToken(raw),
            expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          },
        }),
      ]);
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      await sendPasswordResetEmail(user.email, `${baseUrl}/reset-password?token=${raw}`);
    }
  }

  return NextResponse.json({ ok: true });
}