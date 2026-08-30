"use client";
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";

/**
 * Modern Solana wallets (Phantom, Solflare, Trust Wallet, Backpack, and
 * most others) implement the Wallet Standard and are auto-detected —
 * no need to import each one individually, which avoids depending on
 * specific adapter packages that regularly get deprecated as wallets
 * migrate to the standard.
 *
 * IMPORTANT: this defaults to Solana's public mainnet RPC endpoint,
 * which is free but heavily rate-limited — fine for wallet connection
 * itself, but NOT reliable enough for verifying real deposit
 * transactions at any scale. Before going live, set
 * NEXT_PUBLIC_SOLANA_RPC_ENDPOINT to a real provider (Helius, QuickNode,
 * Alchemy, etc.) — see README for setup.
 */
export default function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT || clusterApiUrl("mainnet-beta"),
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}