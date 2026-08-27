import Link from "next/link";

export default function HomePage() {
  return (
    <div className="pt-8">
      <p className="text-brand text-sm font-semibold tracking-widest uppercase mb-2">
        Free 20,000 NGC to start
      </p>
      <h1 className="scoreboard text-5xl leading-none mb-3">
        THE GOAT OF
        <br />
        FOOTBALL
        <br />
        PREDICTIONS 🐐⚽
      </h1>
      <p className="text-muted mb-8">Predict. Compete. Climb the leaderboard.</p>

      <div className="flex flex-col gap-3 mb-10">
        <Link href="/register" className="btn-primary text-center">
          JOIN NGOAT — Get 20,000 NGC Free
        </Link>
        <Link href="/login" className="btn-secondary text-center">
          Log in
        </Link>
      </div>

      <div className="card mb-4">
        <h2 className="text-sm text-muted uppercase tracking-wide mb-3">How it works</h2>
        <ol className="space-y-2 text-sm">
          <li>1. Create an account — get 20,000 NGC free (worth $10)</li>
          <li>2. Predict football match outcomes, $1–$5 per bet</li>
          <li>3. Win, climb the leaderboard, earn more NGC</li>
          <li>4. Redeem eligible NGC for USDT</li>
        </ol>
      </div>

      <div className="card">
        <h2 className="text-sm text-muted uppercase tracking-wide mb-2">NGOAT Credits</h2>
        <p className="text-sm text-muted">
          NGC are internal platform credits (2,000 NGC = 1 USDT), not currently an on-chain
          cryptocurrency.
        </p>
      </div>
    </div>
  );
}