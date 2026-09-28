import { PlatformConfig } from "@prisma/client";
import { DepositAsset, ASSET_MINTS, getJupiterUsdPrice } from "./solanaConfig";

/**
 * USD price per 1 unit of the given asset.
 *  - USDT: always treated as exactly $1 — no price lookup needed.
 *  - SOL / NGOAT: tries a live Jupiter price first; falls back to the
 *    admin-set fallback rate in PlatformConfig if Jupiter has no
 *    price (e.g. NGOAT before it has real DEX liquidity) or the
 *    request fails for any reason.
 *
 * Returns { price, live } so callers/logs can tell whether the price
 * used was live or a fallback — useful for admin review of manual
 * deposits and for debugging under/over-credits.
 */
export async function getAssetUsdPrice(
  asset: DepositAsset,
  config: Pick<PlatformConfig, "solPriceUsdFallback" | "ngoatPriceUsdFallback">
): Promise<{ price: number; live: boolean }> {
  if (asset === "USDT") return { price: 1, live: true };

  const mint = ASSET_MINTS[asset];
  const live = await getJupiterUsdPrice(mint);
  if (live !== null) return { price: live, live: true };

  const fallback = asset === "SOL" ? config.solPriceUsdFallback : config.ngoatPriceUsdFallback;
  return { price: fallback, live: false };
}

/**
 * How many NGC a given amount of `asset` is worth, using the
 * platform's fixed NGC-per-USD rate (config.usdtToCreditsRate).
 */
export async function creditsForAsset(
  asset: DepositAsset,
  amount: number,
  config: Pick<
    PlatformConfig,
    "usdtToCreditsRate" | "solPriceUsdFallback" | "ngoatPriceUsdFallback"
  >
): Promise<{ credits: number; usdValue: number; priceUsed: number; live: boolean }> {
  const { price, live } = await getAssetUsdPrice(asset, config);
  const usdValue = amount * price;
  const rate = config.usdtToCreditsRate ?? 2000;
  const credits = Math.round(usdValue * rate);
  return { credits, usdValue, priceUsed: price, live };
}