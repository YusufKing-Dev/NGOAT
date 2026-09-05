import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";

const RESEND_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "MISSING_EMAIL" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email } });

  // Same response whether the account exists, is already verified, or
  // not — don't let this endpoint be used to probe which emails are
  // registered. The one exception is the rate-limit case below, which
  // only fires for a real, unverified account and is a deliberate,
  // minimal amount of extra info (no email content or existence is
  // revealed beyond "try again later").
  if (user && !user.emailVerified) {
    if (user.verificationEmailLastSentAt) {
      const msSinceLastSend = Date.now() - user.verificationEmailLastSentAt.getTime();
      if (msSinceLastSend < RESEND_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - msSinceLastSend) / 1000);
        return NextResponse.json(
          { error: "RATE_LIMITED", retryAfterSeconds },
          { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
        );
      }
    }

    const verificationToken = randomBytes(32).toString("hex");
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken,
        verificationTokenExpiry,
        verificationEmailLastSentAt: new Date(),
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const verifyUrl = `${baseUrl}/api/auth/verify?token=${verificationToken}`;
    await sendVerificationEmail(email, verifyUrl);
  }

  return NextResponse.json({ ok: true });
}