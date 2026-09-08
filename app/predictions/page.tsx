import Link from "next/link";
import { prisma } from "@/lib/prisma";

// Reads live config — must never be statically pre-rendered at build
// time with no live DB connection available.
export const dynamic = "force-dynamic";

export default async function PredictionsPage() {
  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const signupBonus = config?.signupBonusCredits ?? 20000;
  const minBet = config?.minBetCredits ?? 5000;
  const rate = config?.usdtToCreditsRate ?? 2000;

  return (
    <div className="pt-8">
      <Link href="/" className="text-xs text-muted hover:text-brand transition">
        ← Back to $NGOAT
      </Link>

      <p className="text-brand text-sm font-semibold tracking-widest uppercase mb-2 mt-4">
        Use case — Free {signupBonus.toLocaleString()} NGC to start
      </p>
      <h1 className="scoreboard text-5xl leading-none mb-3">
        THE GOAT OF
        <br />
        FOOTBALL
        <br />
        PREDICTIONS 🐐⚽
      </h1>
      <p className="text-muted mb-8">
        Predict. Compete. Climb the leaderboard. One of $NGOAT's growing set of use cases.
      </p>

      <div className="flex flex-col gap-3 mb-10">
        <Link href="/register" className="btn-primary text-center">
          CREATE ACCOUNT
        </Link>
        <Link href="/login" className="btn-secondary text-center">
          Log in
        </Link>
      </div>

      <div className="card mb-4">
        <h2 className="text-sm text-brand uppercase tracking-wide mb-3">How it works</h2>
        <ol className="space-y-2 text-sm">
          <li>1. Create an account — get {signupBonus.toLocaleString()} NGC free</li>
          <li>2. Predict football match outcomes, minimum {minBet.toLocaleString()} NGC per bet</li>
          <li>3. Win, climb the leaderboard, earn more NGC</li>
          <li>4. Redeem eligible NGC for USDT</li>
        </ol>
      </div>

      <div className="card">
        <h2 className="text-sm text-brand uppercase tracking-wide mb-2">NGOAT Credits</h2>
        <p className="text-sm text-muted">
          NGC are internal platform credits ({rate.toLocaleString()} NGC = 1 USDT) used inside
          this use case. They are separate from the $NGOAT token itself.
        </p>
      </div>
    </div>
  );
}