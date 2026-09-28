// Public on-chain addresses — safe to commit, these are not secrets.
//
// Single platform deposit wallet. SOL lands here natively; USDT and
// NGOAT land here as SPL-token transfers into this wallet's
// associated token account for each mint.
export const NGOAT_DEPOSIT_WALLET = "HjUowGjNtsx3RNy74HkCLxDtdo35o82xvkDD4qr9rfuS";

export const USDT_MINT_ADDRESS = "HyFhf751PhTv5ANAK91kEsk2fCphzCYd21u1RH34V7M3";
export const NGOAT_MINT_ADDRESS = "8FX8nCzcqK93magyAjvaekPjFQFQJySKoKcd8LJupump";

// Solana's native token has no mint account of its own, but Jupiter's
// price API (and most Solana tooling) uses this well-known sentinel
// address to mean "native SOL". Used only for price lookups below —
// never passed to getAssociatedTokenAddress.
export const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";

export const NGC_PER_USDT = 2000;
export const MIN_DEPOSIT_USDT = 5;

export type DepositAsset = "USDT" | "SOL" | "NGOAT";

export const ASSET_MINTS: Record<DepositAsset, string> = {
  USDT: USDT_MINT_ADDRESS,
  SOL: SOL_MINT_ADDRESS,
  NGOAT: NGOAT_MINT_ADDRESS,
};

/**
 * The RPC endpoint (NEXT_PUBLIC_SOLANA_RPC_ENDPOINT) is intentionally
 * NOT hardcoded here — it contains a provider API key and must live in
 * an env var, never committed to the repo. Falls back to Solana's
 * public RPC if unset, which works for connecting a wallet but is too
 * rate-limited to reliably verify real deposit transactions.
 */
export function getRpcEndpoint(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT || "https://api.mainnet-beta.solana.com";
}

/**
 * Live USD price for a Solana mint, via Jupiter's public price API.
 * Works for SOL and for any SPL token with an active market
 * (including pump.fun tokens once they have liquidity). Returns null
 * on any failure or missing price — callers MUST fall back to an
 * admin-configured rate in that case, never silently treat null as 0.
 */
export async function getJupiterUsdPrice(mint: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${mint}`, {
      // Price lookups are per-request; don't let Next.js cache a stale price.
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const price = json?.data?.[mint]?.price;
    const n = Number(price);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}