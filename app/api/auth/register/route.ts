import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { issueSignupBonus } from "@/lib/ledger";
import { sendVerificationEmail } from "@/lib/email";
import { checkRateLimit, getClientIp, isDisposableEmail, isPlausibleEmail } from "@/lib/security";

function generateReferralCode(): string {
  return randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

export async function POST(req: NextRequest) {
  const { username, email, password, referralCode, website } = await req.json();

  // Honeypot: a hidden field real users never see or fill in. Simple
  // bots that blindly fill every form field trip this; humans never
  // do. Rejected as a generic INVALID_INPUT rather than a distinct
  // error, so a bot scraping error messages can't detect and adapt
  // around the honeypot specifically.
  if (website) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  if (!username || !email || !password || password.length < 8) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  if (!isPlausibleEmail(email)) {
    return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }

  const ip = getClientIp(req);
  const withinLimit = await checkRateLimit(ip, "register", 5, 60 * 60 * 1000); // 5 per hour per IP
  if (!withinLimit) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  if (await isDisposableEmail(email)) {
    return NextResponse.json({ error: "DISPOSABLE_EMAIL" }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    return NextResponse.json({ error: "USER_ALREADY_EXISTS" }, { status: 409 });
  }

  // Resolve an optional referral code to the referrer's user id. An
  // unknown/invalid code is silently ignored rather than blocking
  // registration — referral is a bonus, not a requirement. Matched
  // case-insensitively so a manually-typed code (as opposed to one
  // auto-filled from a link) still works even if the case doesn't
  // exactly match how it was generated.
  let referredByUserId: string | undefined;
  if (referralCode) {
    const referrer = await prisma.user.findFirst({
      where: { referralCode: { equals: referralCode.trim(), mode: "insensitive" } },
    });
    if (referrer) referredByUserId = referrer.id;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const verificationToken = randomBytes(32).toString("hex");
  const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  // Own referral code must be unique — retry on the rare collision.
  let ownReferralCode = generateReferralCode();
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.user.findUnique({ where: { referralCode: ownReferralCode } });
    if (!clash) break;
    ownReferralCode = generateReferralCode();
  }

  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      verificationToken,
      verificationTokenExpiry,
      verificationEmailLastSentAt: new Date(),
      referralCode: ownReferralCode,
      referredByUserId,
    },
  });

  // The free signup bonus is issued immediately, same as before —
  // only the REFERRAL bonus (paid to whoever referred this user) is
  // gated behind email verification, not this one.
  await issueSignupBonus(user.id);

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const verifyUrl = `${baseUrl}/api/auth/verify?token=${verificationToken}`;
  await sendVerificationEmail(email, verifyUrl);

  // No auto-login here anymore — the account can't log in until the
  // email is verified (see lib/auth.ts).
  return NextResponse.json({ ok: true, userId: user.id });
}