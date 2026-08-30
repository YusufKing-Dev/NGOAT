// Public on-chain addresses — safe to commit, these are not secrets.
export const NGOAT_DEPOSIT_WALLET = "9hKZyLjGB77gzVB1sajaphpPe5r9RHi1yFLYWHm9eyj";
export const USDT_MINT_ADDRESS = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

export const NGC_PER_USDT = 2000;
export const MIN_DEPOSIT_USDT = 5;

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