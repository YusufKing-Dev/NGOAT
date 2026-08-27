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