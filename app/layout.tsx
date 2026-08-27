import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Providers } from "./providers";
import SocialLinks from "@/components/SocialLinks";

export const metadata: Metadata = {
  title: "NGOAT — The GOAT of Football Predictions",
  description: "Predict. Compete. Climb the leaderboard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="sticky top-0 z-10 bg-pitch/90 backdrop-blur border-b border-white/5">
            <nav className="max-w-md mx-auto flex items-center justify-between px-4 py-3">
              <Link href="/" className="scoreboard text-xl text-brand">
                NGOAT 🐐
              </Link>
              <div className="flex gap-3 text-sm text-muted">
                <Link href="/dashboard">Dashboard</Link>
                <Link href="/predict">Predict</Link>
              </div>
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