import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addLedgerEntry } from "@/lib/ledger";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  if (!token) {
    return NextResponse.redirect(`${baseUrl}/login?verify=missing_token`);
  }

  const user = await prisma.user.findUnique({ where: { verificationToken: token } });

  if (!user) {
    return NextResponse.redirect(`${baseUrl}/login?verify=invalid`);
  }
  if (user.emailVerified) {
    return NextResponse.redirect(`${baseUrl}/login?verify=already_done`);
  }
  if (user.verificationTokenExpiry && user.verificationTokenExpiry < new Date()) {
    return NextResponse.redirect(`${baseUrl}/login?verify=expired`);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      verificationToken: null,
      verificationTokenExpiry: null,
    },
  });

  // Pay the referral bonus now, if this user was referred and it
  // hasn't already been paid (referralBonusPaid guards against a
  // double-credit if this link is ever hit twice).
  if (user.referredByUserId && !user.referralBonusPaid) {
    const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
    const bonus = config?.referralBonusCredits ?? 2000;

    await addLedgerEntry({
      userId: user.referredByUserId,
      type: "REFERRAL_BONUS",
      amount: bonus,
      description: "Referral bonus — referred user verified their email",
      referencePrefix: "ref",
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { referralBonusPaid: true },
    });
  }

  return NextResponse.redirect(`${baseUrl}/login?verify=success`);
}