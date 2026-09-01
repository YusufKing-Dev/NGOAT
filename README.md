# NGOAT — MVP scaffold

## Free signup bonus + betting limits (added)
- Rate: **1 NGC = $0.0005**, i.e. **2,000 NGC = 1 USDT**
- New users get **20,000 NGC free** (= $10) on registration, issued as a
  `SIGNUP_BONUS` ledger entry via `issueSignupBonus()` in `lib/ledger.ts`
- Bets: **2,000–10,000 NGC** ($1–$5), enforced in
  `app/api/predictions/route.ts` against `PlatformConfig.minBetCredits`
  / `maxBetCredits`
- **Wagering requirement**: the free bonus (and anything won from it)
  can't be withdrawn until the user has staked bonus × 3 in total
  predictions. Progress is tracked on `User.bonusWageringProgress` and
  checked by `isWithdrawalEligible()` before any `WithdrawalRequest` is
  created. This is the standard anti-abuse pattern real betting
  platforms use to stop people from farming free credits with
  throwaway accounts and cashing out immediately.
- **Still open**: nothing currently stops one person from creating many
  accounts to claim the bonus repeatedly. Before this goes public, add
  email verification and/or a device/IP check at registration — the
  `TODO` in `app/api/auth/register/route.ts` marks where.

Ledger-first architecture: `LedgerEntry` is the only source of truth for
balances. Never add a `balance` column to `User` — always derive it with
`getBalance()` in `lib/ledger.ts`. Every credit/debit goes through
`addLedgerEntry` or `debitWithCheck`, which wraps the balance check and
insert in one DB transaction to prevent race conditions (e.g. same credits
spent twice from two tabs).

## What's in this build (complete MVP, all wired up)
- `prisma/schema.prisma` — full data model
- `lib/ledger.ts`, `lib/prisma.ts`, `lib/auth.ts` — ledger logic + NextAuth (Credentials, bcrypt, JWT sessions)
- **Auth**: `/register`, `/login`, `app/api/auth/register`, `app/api/auth/[...nextauth]`
- **User pages**: `/` (home), `/dashboard` (balance, stats, wagering progress, activity),
  `/predict` (upcoming matches, stake), `/buy-ngoat` (submit deposit),
  `/withdraw` (submit withdrawal, blocked until wagering requirement met),
  `/leaderboard`
- **Admin**: `/admin` — approve/reject deposits, mark withdrawals paid, create matches, settle matches (all in one page)
- **API**: deposits, predictions, matches, leaderboard, me, and the full `admin/*` set (deposits, deposits/[id]/approve, deposits/[id]/reject, withdrawals, withdrawals/[id]/pay, matches, matches/[id]/settle)

## Known placeholders — fix before real users touch this
- `app/buy-ngoat/page.tsx` hardcodes `DEPOSIT_WALLET = "SET_IN_ADMIN_PANEL"`.
  There's no config API route yet to serve `PlatformConfig.depositWallet`
  to the frontend — add `app/api/config/route.ts` (public GET, just the
  wallet/network/rate fields) and fetch it there instead of hardcoding.
- No admin user exists by default. After your first `prisma migrate deploy`,
  manually set one user's `role` to `ADMIN` in the DB (Neon/Supabase both
  have a SQL console for this) — there's no UI for promoting admins yet.
- On-chain deposit verification is still trust-the-submitted-hash +
  manual admin eyeballing, not automatic block-explorer verification.
- No email verification / device check at signup — the free-bonus
  multi-accounting risk flagged earlier is still open.
- No rate limiting on `/api/auth/register` or `/api/predictions` yet.

## Setup
```bash
npm install
# set DATABASE_URL in .env (Neon/Supabase Postgres works well for fast setup)
# set NEXTAUTH_SECRET (openssl rand -base64 32) and NEXTAUTH_URL in .env
npx prisma migrate dev --name init
npm run dev
```

## Deploying
1. Push this repo to GitHub, import into Vercel (auto-detects Next.js)
2. Add env vars in Vercel: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
3. Run `npx prisma migrate deploy` locally against the production `DATABASE_URL` (once, and again after any schema change)
4. Promote your own account to `ADMIN` via the DB console
5. Every `git push` after that redeploys automatically
- Football-data API auto-import (enter matches/results manually for now)
- On-chain deposit verification (trust submitted tx hash + manual admin
  check against a block explorer for now)
- Notifications, 2FA, audit logs, WalletConnect

## Automated football data (added)
Matches now import and settle themselves — you don't have to create or
settle them by hand anymore, except for anything you create manually
in the admin panel (which always stays manual on purpose).

**How it works:**
- `app/api/cron/import-fixtures` — pulls upcoming fixtures from
  football-data.org for PL, La Liga, Bundesliga, Serie A, Ligue 1, and
  Champions League, and creates `Match` rows automatically. Runs daily
  via Vercel Cron (`vercel.json`) — Hobby plan caps cron at once/day.
- `app/api/cron/settle-results` — checks auto-imported matches whose
  kickoff has passed; if the provider says `FINISHED`, settles it and
  pays winners; if `POSTPONED`/`SUSPENDED`/`CANCELLED`, refunds all
  stakes instead of leaving them stuck. Runs every 15 minutes via a
  GitHub Actions workflow (`.github/workflows/settle-results.yml`),
  since Vercel's free tier can't run cron that often.
- Only matches with an `externalId` (i.e. ones the system imported
  itself) are ever touched by these — anything you add by hand in
  `/admin` has no `externalId` and always needs manual settlement.
  This keeps auto-settlement scoped to data our own import created,
  not open-ended.

**Setup:**
1. Get a free API key at https://www.football-data.org/client/register
   (no card required)
2. Add to Vercel env vars: `FOOTBALL_DATA_API_KEY` (the key from step 1)
   and `CRON_SECRET` (any random string — `openssl rand -hex 20` works)
3. In your GitHub repo: Settings → Secrets and variables → Actions →
   add `NGOAT_URL` (your deployed Vercel URL, no trailing slash) and
   `CRON_SECRET` (the exact same value as in Vercel)
4. Push — the GitHub Action starts polling automatically once it's on
   the default branch. Vercel's daily cron picks up on its own schedule.
5. Test manually before waiting a day: visit
   `https://your-app.vercel.app/api/cron/import-fixtures` with an
   `Authorization: Bearer <CRON_SECRET>` header (Postman, curl, or the
   "Run workflow" button on the GitHub Action for settle-results) to
   confirm it works rather than waiting on the schedule.

**Still worth knowing:** football-data.org's free tier is 10
requests/minute — fine for this usage, but if you add many more
competitions later you may need to space out the import loop or
upgrade their plan.

## Major update: accumulator predictions, staking, stricter withdrawals, wallet connect

**Predictions are now accumulator-only.** A single-match straight bet no
longer exists — every prediction is a "slip" of at least 3 matches
(`PlatformConfig.minSlipLegs`), one stake for the whole slip, and ALL
legs must win for it to pay out. Reward = `stake x rewardMultiplier ^
(number of winning legs)`, so more legs = more risk = more reward. A
leg that gets voided (match postponed/cancelled) is dropped from the
requirement rather than failing the slip — if every leg in a slip ends
up voided, the stake is refunded. See `lib/settlement.ts` for the full
logic.

**NGC staking** (`/stake`, `app/api/stakes`): lock at least 40,000 NGC
for 3 months, 6 months, or 1 year. Grows 0.1%/day (compounding), no
early withdrawal — the full amount releases automatically at maturity
via `app/api/cron/release-stakes`, now polled by the same GitHub Action
that checks football results every 15 minutes.

**Withdrawals are stricter now:**
- The original signup bonus can **never** be withdrawn, even after the
  wagering requirement is met — only balance earned on top of it
  (`User.bonusFloor`, see `getWithdrawableBalance()` in `lib/ledger.ts`).
- $5 minimum, $100 maximum per calendar day
  (`PlatformConfig.minWithdrawalUsdt` / `maxDailyWithdrawalUsdt`).

**Wallet connect (Solana) — partially built, needs your input before
it's fully live:**
- ✅ Done: wallet connection UI (`components/SolanaWalletProvider.tsx`,
  the Connect button on `/buy-ngoat`) — supports any Wallet Standard
  wallet (Phantom, Solflare, Trust Wallet, Backpack, etc.) automatically.
- ❌ Not built yet: actually constructing and sending a USDT (SPL
  token) transfer from the connected wallet, and verifying it on-chain
  to auto-credit NGC. This needs:
  1. Your real Solana deposit wallet address
  2. A Solana RPC provider (the free public endpoint used by default
     is too rate-limited for real deposit verification — get a key from
     Helius, QuickNode, or similar, then set
     `NEXT_PUBLIC_SOLANA_RPC_ENDPOINT` in your env vars)
  3. The USDT SPL-token mint address on Solana (already has a config
     slot: `PlatformConfig.solanaUsdtMint`)

  The manual tx-hash-and-admin-approval flow on `/buy-ngoat` still
  works today and is the current real path until the above is wired
  up — don't remove it.

**Migration needed:**
```powershell
npx prisma migrate dev --name accumulators_staking_wallet_connect
```

**New dependency install needed** (wallet adapter packages):
```powershell
npm install
```

## Wallet-connect deposits are now LIVE (real on-chain flow)

The manual tx-hash-and-admin-approval form on `/buy-ngoat` has been
**removed entirely**. The flow is now:

1. User connects a Solana wallet (Phantom, Solflare, Trust Wallet,
   Backpack, or any other Wallet Standard wallet — auto-detected).
2. They enter a USDT amount and click "Buy NGOAT with USDT."
3. The app builds and sends a real SPL-token USDT transfer from their
   wallet to the platform's deposit wallet.
4. Once confirmed on-chain, `app/api/deposits/onchain/route.ts`
   independently verifies the transaction against Solana itself
   (not just trusting what the client claims) and credits NGC
   automatically — no admin approval step in this path anymore.

**Config** (`lib/solanaConfig.ts`):
- Deposit wallet: `9hKZyLjGB77gzVB1sajaphpPe5r9RHi1yFLYWHm9eyj`
- USDT SPL mint: `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`
  (verify this against Solscan/CoinGecko before real money moves
  through it — it's correct as of when this was written, but confirm
  independently since this is exactly the kind of value where being
  wrong is expensive)

**Required env var — set this in `.env` locally AND in Vercel:**
```
NEXT_PUBLIC_SOLANA_RPC_ENDPOINT="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
```
This is used both client-side (building/sending the transaction) and
server-side (verifying it) — same variable, both places.

**Security note:** because this key is used client-side, it's visible
to anyone who inspects the site's network requests or JS bundle — that
part is unavoidable for a wallet-connect app using a provider RPC
directly. Recommended: in Helius's dashboard, restrict this key to your
site's domain so it can't be freely reused elsewhere if someone copies
it.

**Not tested against a live network** — this was written using the
standard `@solana/web3.js` + `@solana/spl-token` patterns but couldn't
be run against real Solana infrastructure while building it. Test with
a small real transaction ($5, using your own wallet) once deployed,
before trusting it with other users' money.

**Legacy manual-deposit backend still exists** (`app/api/deposits/route.ts`,
admin approve/reject) for record-keeping/edge cases, but nothing in the
UI calls it anymore — the on-chain flow is now the only real path.

## New migration needed (adds a unique constraint on DepositRequest.txHash)
```powershell
npx prisma migrate dev --name onchain_deposits
```
(Run this AFTER the earlier `accumulators_staking_wallet_connect`
migration if you haven't run that one yet — do both, in order.)

## Email verification (Resend) + referrals + one-wallet-per-account

**Email verification** — registration no longer auto-logs in. It sends
a verification link (via Resend) and login is blocked
(`EMAIL_NOT_VERIFIED`) until that link is clicked. A resend option is
on the login page for expired/lost links.

**Required env vars** (set in `.env` and Vercel):
```
RESEND_API_KEY="your Resend API key"
RESEND_FROM_EMAIL="verify@ngoat.xyz"   # must be on a domain verified in Resend
```
Until both are set, registration still works, but no email actually
sends (logged as a warning server-side) — useful for local dev before
the domain is fully verified.

**Referrals** — every user gets a unique `referralCode`
(`/register?ref=CODE` pre-fills it). The referrer gets 2,000 NGC
(`PlatformConfig.referralBonusCredits`) once the referred user verifies
their email — not at raw signup, so it's tied to the same anti-abuse
gate. Shareable link + running count shown on `/dashboard`.

**One wallet per account** — enforced at first withdrawal, not signup
(keeps the free bonus frictionless). `/withdraw` now uses your actually
connected Solana wallet instead of a typed-in address. The first wallet
you withdraw with gets permanently linked (`User.walletAddress`,
DB-unique) — every withdrawal after that must use that same wallet, and
no other account can ever link it.

## New migration needed
```powershell
npx prisma migrate dev --name email_verification_referrals_wallet_link
```