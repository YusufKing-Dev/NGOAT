"use client";
import { SessionProvider } from "next-auth/react";
import SolanaWalletProvider from "@/components/SolanaWalletProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SolanaWalletProvider>{children}</SolanaWalletProvider>
    </SessionProvider>
  );
}