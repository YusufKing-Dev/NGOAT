import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueSignupBonus } from "@/lib/ledger";

// Reads live data / has side effects on every request — must never
// be statically pre-rendered at build time.
export const dynamic = "force-dynamic";

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

  // Pay this user's own signup bonus now that their email is
  // confirmed real. issueSignupBonus guards against a double-credit
  // via signupBonusIssued, so this is safe even if verify is ever
  // hit twice for the same token before the update above lands.
  try {
    await issueSignupBonus(user.id);
  } catch (e: any) {
    if (e.message !== "BONUS_ALREADY_ISSUED") throw e;
  }

  // Referral bonus is NOT paid here anymore — it's paid on the
  // referred user's FIRST APPROVED DEPOSIT instead, via
  // lib/ledger.ts:onDepositApproved(). This stops referral-bonus
  // farming via verified accounts that never put real money in.

  return NextResponse.redirect(`${baseUrl}/login?verify=success`);
}