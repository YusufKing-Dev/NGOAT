import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Reads/writes live data — must never be statically pre-rendered.
export const dynamic = "force-dynamic";

const NUMERIC_FIELDS = [
  "usdtToCreditsRate",
  "minDeposit",
  "maxDeposit",
  "minRedemption",
  "maxRedemption",
  "signupBonusCredits",
  "bonusWageringMultiplier",
  "minBetCredits",
  "rewardMultiplier",
  "referralBonusCredits",
  "minSlipLegs",
  "stakingMinCredits",
  "stakingDailyRatePct",
  "minWithdrawalUsdt",
  "maxDailyWithdrawalUsdt",
] as const;

const STRING_FIELDS = [
  "depositWallet",
  "depositNetwork",
  "solanaUsdtMint",
  "solanaRpcEndpoint",
  "blockedEmailDomains",
] as const;

const BOOLEAN_FIELDS = ["withdrawalsEnabled"] as const;

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const config = await prisma.platformConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  return NextResponse.json({ config });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  for (const field of NUMERIC_FIELDS) {
    if (body[field] !== undefined && body[field] !== "") {
      const n = Number(body[field]);
      if (!Number.isNaN(n)) data[field] = n;
    }
  }
  for (const field of STRING_FIELDS) {
    if (body[field] !== undefined) {
      data[field] = String(body[field]).trim() || null;
    }
  }
  for (const field of BOOLEAN_FIELDS) {
    if (body[field] !== undefined) {
      data[field] = body[field] === true || body[field] === "true";
    }
  }

  const config = await prisma.platformConfig.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });

  return NextResponse.json({ ok: true, config });
}