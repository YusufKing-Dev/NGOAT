import Link from "next/link";
import WhitepaperModal from "@/components/WhitepaperModal";

const LOGO_URL =
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787822761/IMG_20260827_102554_940_tcek9f.jpg";

const TOKENOMICS = [
  { label: "Total Supply", value: "1,000,000,000 $NGOAT" },
  { label: "Blockchain", value: "Solana" },
  { label: "Tax", value: "0%" },
  { label: "Contract Address", value: "Coming Soon" },
];

const ALLOCATION = [
  { label: "Liquidity", pct: "70%", amount: "700,000,000" },
  { label: "Community & Rewards", pct: "10%", amount: "100,000,000" },
  { label: "Marketing", pct: "8%", amount: "80,000,000" },
  { label: "Ecosystem Development", pct: "7%", amount: "70,000,000" },
  { label: "Team / Dev", pct: "5%", amount: "50,000,000" },
];

const ROADMAP = [
  {
    phase: "Phase 1",
    title: "The Birth of NGOAT",
    items: [
      "NGOAT branding & mascot creation",
      "Official Telegram community",
      "Social media growth",
      "Whitepaper release",
      "Community contests & giveaways",
      "Token launch",
      "Initial liquidity",
      "DexScreener/DexTools visibility",
      "Build a strong organic holder base",
    ],
  },
  {
    phase: "Phase 2",
    title: "Build the Herd 🐐",
    items: [
      "Aggressive community growth",
      "Meme campaigns",
      "Community raids & collaborations",
      "Influencer/KOL partnerships",
      "Holder competitions",
      "Daily NGOAT reward game",
      "Community ambassador program",
      "CoinMarketCap & CoinGecko applications",
      "Expand NGOAT's social presence",
    ],
  },
  {
    phase: "Phase 3",
    title: "NGOAT Utility",
    items: [
      "Launch NGOAT website/platform",
      "User registration & personal dashboards",
      "NGOAT football prediction system",
      "NGOAT allocation/purchase system",
      "Prediction history and results",
      "Reward/redeem system",
      "USDT withdrawal functionality",
      "Community reward mechanisms",
    ],
  },
  {
    phase: "Phase 4",
    title: "NGOAT Ecosystem",
    items: [
      "Expand football prediction features",
      "More competitions and prediction markets",
      "Strategic partnerships",
      "Community tournaments",
      "NGOAT merchandise",
      "Additional ecosystem utilities",
      "Larger marketing campaigns",
      "Explore CEX listings",
    ],
  },
  {
    phase: "Phase 5",
    title: "The Real GOAT 🐐👑",
    items: [
      "Global NGOAT community",
      "Major brand partnerships",
      "International marketing",
      "Expansion beyond Nigeria",
      "Continued platform development",
      "Community governance initiatives",
      "Major exchange opportunities",
      "NGOAT becomes a recognizable African meme/utility brand",
    ],
  },
];

export default function HomePage() {
  return (
    <div className="pt-8 space-y-10">
      {/* HERO */}
      <section className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LOGO_URL}
          alt="NGOAT logo"
          className="w-28 h-28 rounded-full mx-auto mb-4 border-2 border-brand object-cover"
        />
        <p className="text-brand text-sm font-semibold tracking-widest uppercase mb-2">
          $NGOAT on Solana
        </p>
        <h1 className="scoreboard text-3xl leading-tight mb-3">
          NGOAT
          <br />
          THE REAL GOAT 🐐
        </h1>
        <p className="text-blue-400 mb-6">
          Everyone knows the GOAT.
          <br />
          Nigeria has its own — NGOAT.
          <br />
          Meme culture meets football, entertainment, and community-driven utility.
        </p>
        <div className="flex flex-col gap-3">
          <Link href="/predictions" className="btn-primary">
            Launch App — Try Predictions
          </Link>
          <WhitepaperModal />
          <button
            disabled
            className="btn-secondary opacity-60 cursor-not-allowed"
            title="Contract address goes live at launch"
          >
            Buy $NGOAT — Coming Soon
          </button>
        </div>
      </section>

      {/* ABOUT */}
      <section className="card text-center">
        <h2 className="text-sm text-muted uppercase tracking-wide mb-3">About NGOAT</h2>
        <div className="text-sm leading-relaxed space-y-3">
          <p>
            NGOAT is a community-driven meme coin built around one simple idea: everyone knows
            the GOAT, but Nigeria has its own GOAT — NGOAT.
          </p>
          <p>
            Born from Nigerian internet culture, football passion, memes and crypto, NGOAT is
            designed to be more than just another meme token. The project aims to build an
            entertaining community while gradually introducing real utility around the NGOAT
            ecosystem.
          </p>
          <p>
            The first layer is the meme culture — a recognizable mascot, viral content, community
            competitions and social engagement. The second layer is utility: a football
            prediction platform where registered users can acquire NGOAT credits and use them to
            participate in football predictions, redeeming rewards through the platform.
          </p>
          <p>
            NGOAT's long-term vision is to become a recognizable African crypto brand where meme
            culture meets entertainment, football and community-driven utility.
          </p>
          <p className="text-brand font-semibold">
            NGOAT isn't here to be just another coin. NGOAT is here to become the REAL GOAT.
          </p>
        </div>
      </section>

      {/* TOKENOMICS */}
      <section className="card">
        <h2 className="text-sm text-muted uppercase tracking-wide mb-3">Tokenomics</h2>
        <div className="space-y-2 text-sm mb-4">
          {TOKENOMICS.map((row) => (
            <div key={row.label} className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-muted">{row.label}</span>
              <span>{row.value}</span>
            </div>
          ))}
        </div>

        <h3 className="text-xs text-muted uppercase tracking-wide mb-2">Allocation</h3>
        <div className="space-y-2 text-sm">
          {ALLOCATION.map((row) => (
            <div key={row.label} className="flex justify-between">
              <span className="text-muted">{row.label}</span>
              <span>{row.pct}</span>
            </div>
          ))}
        </div>
      </section>

      {/* USE CASES */}
      <section>
        <h2 className="scoreboard text-2xl mb-4">USE CASES</h2>
        <div className="space-y-3">
          <Link href="/predictions" className="card block hover:opacity-90 transition">
            <p className="text-xs text-brand uppercase tracking-wide mb-1">Live now</p>
            <h3 className="font-semibold mb-1 text-ink">🐐⚽ Football Predictions</h3>
            <p className="text-sm text-muted">
              Predict match outcomes, compete on the leaderboard, redeem winnings.
            </p>
          </Link>
          <div className="card">
            <p className="text-xs text-brand uppercase tracking-wide mb-1">
              Monthly staking loading.....
            </p>
            <h3 className="font-semibold mb-1 text-ink">Stake to earn more</h3>
            <p className="text-sm text-muted">
              Additional competitions and ecosystem utilities as NGOAT expands.
            </p>
          </div>
        </div>
      </section>

      {/* ROADMAP */}
      <section className="card">
        <h2 className="text-sm text-muted uppercase tracking-wide mb-4">Roadmap</h2>
        <div className="space-y-5">
          {ROADMAP.map((r) => (
            <div key={r.phase}>
              <p className="font-semibold text-brand text-sm">
                {r.phase} — {r.title}
              </p>
              <ul className="text-sm text-muted mt-1 space-y-0.5 list-disc list-inside">
                {r.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}