import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Reads live data — must never be statically pre-rendered/cached.
export const dynamic = "force-dynamic";

// Public, unauthenticated — unlike /api/admin/config, this deliberately
// exposes ONLY the handful of flags a client page needs to render
// correctly before the user submits anything (e.g. whether to show the
// withdrawal form at all). Never add anything sensitive here
// (deposit wallet, RPC endpoints, rates that shouldn't be public,
// etc.) — everything else stays behind /api/admin/config.
export async function GET() {
  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });

  return NextResponse.json({
    withdrawalsEnabled: config?.withdrawalsEnabled ?? false,
    minWithdrawalUsdt: config?.minWithdrawalUsdt ?? 5,
    maxDailyWithdrawalUsdt: config?.maxDailyWithdrawalUsdt ?? 100,
    minBetCredits: config?.minBetCredits ?? 5000,
    minSlipLegs: config?.minSlipLegs ?? 5,
    referralBonusCredits: config?.referralBonusCredits ?? 500,
    stakingMinCredits: config?.stakingMinCredits ?? 40000,
    stakingDailyRatePct: config?.stakingDailyRatePct ?? 0.1,
    signupBonusCredits: config?.signupBonusCredits ?? 20000,
    usdtToCreditsRate: config?.usdtToCreditsRate ?? 2000,
  });
}