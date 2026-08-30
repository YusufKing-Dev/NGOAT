import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Providers } from "./providers";
import SocialLinks from "@/components/SocialLinks";

export const metadata: Metadata = {
  title: "NGOAT — The Real GOAT",
  description:
    "A community-driven meme coin on Solana. Meme culture meets football, entertainment, and community-driven utility.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="sticky top-0 z-10 bg-pitch/90 backdrop-blur border-b border-white/5">
            <nav className="max-w-md mx-auto flex items-center justify-between px-4 py-3">
              <Link href="/" className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://res.cloudinary.com/drdrwbdkp/image/upload/v1787822761/IMG_20260827_102554_940_tcek9f.jpg"
                  alt="NGOAT"
                  className="w-7 h-7 rounded-full object-cover"
                />
                <span className="scoreboard text-xl text-brand">$NGOAT</span>
              </Link>
              <Link href="/predictions" className="text-sm text-muted hover:text-brand transition">
                Launch App
              </Link>
            </nav>
          </header>
          <main className="max-w-md mx-auto px-4 pb-8">{children}</main>
          <footer className="max-w-md mx-auto px-4 pb-10 pt-6 border-t border-white/5">
            <SocialLinks />
          </footer>
        </Providers>
      </body>
    </html>
  );
}