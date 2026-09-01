import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "MISSING_EMAIL" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email } });

  // Same response whether the account exists, is already verified, or
  // not — don't let this endpoint be used to probe which emails are
  // registered.
  if (user && !user.emailVerified) {
    const verificationToken = randomBytes(32).toString("hex");
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { verificationToken, verificationTokenExpiry },
    });

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const verifyUrl = `${baseUrl}/api/auth/verify?token=${verificationToken}`;
    await sendVerificationEmail(email, verifyUrl);
  }

  return NextResponse.json({ ok: true });
}