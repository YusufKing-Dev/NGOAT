import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAssetUsdPrice } from "@/lib/assetPricing";
import { DepositAsset } from "@/lib/solanaConfig";

// Reads live data (Jupiter price + admin fallback rate) — never
// statically pre-rendered.
export const dynamic = "force-dynamic";

/**
 * GET /api/price?asset=USDT|SOL|NGOAT
 *
 * Lets the client show an accurate "you'll receive ~X NGC" estimate
 * BEFORE building a transaction, using the exact same live-price +
 * admin-fallback logic the deposit-verification route uses server
 * side — so the estimate the person sees always matches what they'll
 * actually be credited (up to real-time price movement between the
 * quote and the on-chain transfer).
 */
export async function GET(req: NextRequest) {
  const assetParam = req.nextUrl.searchParams.get("asset");
  const asset: DepositAsset = assetParam === "SOL" || assetParam === "NGOAT" ? assetParam : "USDT";

  const config = await prisma.platformConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  const { price, live } = await getAssetUsdPrice(asset, config);

  return NextResponse.json({ asset, price, live, ngcPerUsd: config.usdtToCreditsRate });
}