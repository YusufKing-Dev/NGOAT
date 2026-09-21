import Link from "next/link";
import WhitepaperModal from "@/components/WhitepaperModal";
import CopyButton from "@/components/CopyButton";
import { prisma } from "@/lib/prisma";

const LOGO_URL =
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1789847856/IMG_20260919_205057_929_hr6nsh.jpg";

// Reads live config (signup bonus) — must never be statically
// pre-rendered at build time with no live DB connection available.
export const dynamic = "force-dynamic";

const TOKENOMICS = [
  { label: "Total Supply", value: "1,000,000,000 $NGOAT" },
  { label: "Blockchain", value: "Solana" },
  { label: "Tax", value: "0%" },
];

const CONTRACT_ADDRESS = "8FX8nCzcqK93magyAjvaekPjFQFQJySKoKcd8LJupump";
const BUY_URL = "https://pump.fun/coin/8FX8nCzcqK93magyAjvaekPjFQFQJySKoKcd8LJupump";

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
    title: "Foundation — Now",
    items: [
      "Finalize NGOAT brand, identity and ecosystem structure",
      "Complete the NGOAT website",
      "Launch NGOATcredit ($NGC)",
      "Set up user registration and wallet/account system",
      "Introduce the 20,000 NGC welcome reward",
      "Establish official Telegram/community channels",
      "Publish transparent information about NGC and the ecosystem",
    ],
  },
  {
    phase: "Phase 2",
    title: "NGC Ecosystem",
    items: [
      "Enable USDT → NGC purchases",
      "Enable NGC → USDT withdrawals",
      "Launch NGC staking",
      "Develop and launch the football prediction platform",
      "Introduce community rewards and competitions",
      "Monitor platform performance, security and user experience",
    ],
  },
  {
    phase: "Phase 3",
    title: "Community & Trust",
    items: [
      "Grow the NGC user base organically",
      "Build an active football/prediction community",
      "Develop strategic partnerships",
      "Expand NGC utility",
      "Improve website, wallet and platform infrastructure",
      "Publish regular development and transparency updates",
      "Build sufficient liquidity/reserves to support the platform's promised functions",
    ],
  },
  {
    phase: "Phase 4",
    title: "NGOAT Preparation",
    items: [
      "Finalize $NGOAT tokenomics",
      "Determine the relationship and conversion mechanism between NGC and NGOAT",
      "Conduct security reviews/audits where appropriate",
      "Prepare liquidity strategy",
      "Establish treasury and community-reward policies",
      "Prepare DEX launch infrastructure",
      "Publish the complete NGC → NGOAT migration plan",
    ],
  },
  {
    phase: "Phase 5",
    title: "$NGOAT Launch",
    items: [
      "Launch NGOATCOIN ($NGOAT) on a suitable DEX",
      "Provide verified contract and token information",
      "Establish initial liquidity",
      "Begin the official NGC migration process",
      "Enable eligible NGC holders to transition into NGOAT according to the published conversion rules",
    ],
  },
  {
    phase: "Phase 6",
    title: "NGOAT Ecosystem Expansion",
    items: [
      "Expand football prediction features",
      "Develop additional staking/community utilities",
      "Introduce partnerships and ecosystem integrations",
      "Expand the NGOAT community internationally",
      "Continue improving the website and user experience",
      "Explore additional DEX/CEX opportunities when justified by adoption and readiness",
    ],
  },
];

export default async function HomePage() {
  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const signupBonus = config?.signupBonusCredits ?? 20000;

  return (
    <div className="pt-8 space-y-10">
      {/* HERO */}
      <section className="text-center hero-bg px-4 py-8">
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
          NGOATCOIN
          <br />
          THE REAL GOAT 🐐
        </h1>
        <p className="text-blue-400 mb-6">
          NGOATCOIN ($NGOAT) is the ecosystem token powering the NGOAT community — a
          community-driven meme ecosystem built around football, prediction, gaming, rewards,
          staking, and entertainment.
          <br />
          <br />
          $NGOAT connects its community to the existing NgoatCredit ($NGC) platform, where users
          can play, predict, earn and participate in different ecosystem use cases.
        </p>
        <div className="flex flex-col gap-3">
          <Link href="/predictions" className="btn-primary">
            Join $NGOAT — Get {signupBonus.toLocaleString()} NGC Free
          </Link>
          <WhitepaperModal />
          <a
            href={BUY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-center"
          >
            Buy $NGOAT on pump.fun
          </a>
        </div>
      </section>

      {/* ABOUT */}
      <section className="card text-center">
        <h2 className="text-sm text-muted uppercase tracking-wide mb-3">About NGOAT</h2>
        <div className="text-sm leading-relaxed space-y-3">
          <p>
            NGOAT is a community-driven meme coin built around one simple idea: everyone knows
            the GOAT, but Africa has its own GOAT — NGOAT.
          </p>
          <p>
            Born from African internet culture, football passion, memes and crypto, NGOAT is
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
        <h2 className="text-sm text-brand uppercase tracking-wide mb-3">Tokenomics</h2>
        <div className="space-y-2 text-sm mb-4">
          {TOKENOMICS.map((row) => (
            <div key={row.label} className="flex justify-between border-b border-white/5 pb-2">
              <span className="text-muted">{row.label}</span>
              <span>{row.value}</span>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-3 mb-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs text-muted uppercase tracking-wide">Contract Address</p>
            <CopyButton text={CONTRACT_ADDRESS} />
          </div>
          <p className="font-mono text-xs break-all select-all text-ink">{CONTRACT_ADDRESS}</p>
        </div>

        <h3 className="text-xs text-brand uppercase tracking-wide mb-2">Allocation</h3>
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
          <Link href="/stake" className="card block hover:opacity-90 transition">
            <p className="text-xs text-brand uppercase tracking-wide mb-1">Live now</p>
            <h3 className="font-semibold mb-1 text-ink">💰 Stake to Earn</h3>
            <p className="text-sm text-muted">
              Lock NGC for a fixed term and grow your balance automatically over time.
            </p>
          </Link>
          <Link href="/spinthewheel" className="card block hover:opacity-90 transition">
            <p className="text-xs text-brand uppercase tracking-wide mb-1">Live now</p>
            <h3 className="font-semibold mb-1 text-ink">🎡 Spin the Wheel</h3>
            <p className="text-sm text-muted">
              Spin for a shot at a bigger payout — land the right segment and win big.
            </p>
          </Link>
          <Link href="/numberpick" className="card block hover:opacity-90 transition">
            <p className="text-xs text-brand uppercase tracking-wide mb-1">Live now</p>
            <h3 className="font-semibold mb-1 text-ink">🎯 Weekly Draw</h3>
            <p className="text-sm text-muted">
              Pick your numbers once a week for a shot at the jackpot.
            </p>
          </Link>
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
              <ul className="text-sm text-muted mt-1 space-y-1 list-disc list-outside pl-5">
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
