# NGOAT

NGOAT is a Next.js + Prisma football prediction and NGC rewards platform with Solana wallet integration, deposits, withdrawals, staking, referrals, leaderboard features, and additional games.

> **Current status:** The codebase contains the main application flows and production-oriented controls, but money-moving features should still be tested carefully on mainnet before public launch.

## Core features

### Account & security
- Username/email registration and login with NextAuth Credentials.
- Password hashing with bcrypt.
- Email verification through Resend.
- Forgot-password and change-password flows.
- Password-reset withdrawal hold to reduce account-takeover cash-out risk.
- Verification-email resend cooldown.
- Disposable/blocked email-domain controls.
- Suspended-account support.
- Server-side session/auth checks.

### NGC ledger

NGC balances use a **ledger-first architecture**.

There is no raw `User.balance` field. Confirmed `LedgerEntry` records are the source of truth, and balance-changing operations go through the ledger helpers in `lib/ledger.ts`.

This covers:
- Signup bonuses
- Deposits
- Prediction stakes and rewards
- Refunds
- Withdrawals/redemptions
- Staking principal and profit
- Referrals
- Spin the Wheel
- Number Pick

Transactions and balance checks are designed to prevent double-spending from concurrent requests.

### Signup bonus

By default:
- **20,000 NGC** signup bonus
- **1 USDT = 2,000 NGC**
- Bonus-derived funds are not directly withdrawable.
- The bonus has a wagering requirement before the account becomes eligible for normal withdrawal rules.
- The original bonus is also protected by `bonusFloor`, so the bonus itself cannot simply be cashed out after meeting the wagering requirement.

### Referrals

Each account receives a unique referral code.

A referral can be registered with:

```text
/register?ref=REFERRAL_CODE
```

The referrer receives the configured referral bonus only after the referred user makes their **first approved deposit**. This prevents referral rewards from being farmed through accounts that never bring real deposits.

The default referral reward is **2,000 NGC**.

## Football predictions

Football fixtures are imported from **football-data.org** for:

- Premier League (`PL`)
- La Liga (`PD`)
- Bundesliga (`BL1`)
- Serie A (`SA`)
- Ligue 1 (`FL1`)
- Champions League (`CL`)

The current fixture window is **21 days**.

### Prediction modes

The prediction API currently supports two modes:

#### Singles
Each selected match is an independent bet with its own stake.

#### Multiple / accumulator
Several matches are combined into one slip with one stake. Every selected leg must win for the multiple to win.

The minimum number of legs for multiples is controlled by:

```text
PlatformConfig.minSlipLegs
```

The current database default is **5 legs**.

### Markets

The prediction system supports market-based selections through `lib/markets.ts`, including:

- 1X2
- Over/Under
- Double Chance

Odds are stored with the match and locked onto the prediction when it is placed. The server checks the current odds before accepting a bet; if they changed, the request is rejected with an `ODDS_CHANGED` response instead of silently using stale odds.

### Automated fixtures and settlement

`app/api/cron/import-fixtures` imports upcoming fixtures.

`app/api/cron/settle-results` checks imported matches after kickoff and settles finished results. Cancelled/postponed/suspended fixtures can be refunded according to the settlement logic.

Only fixtures with a football-data.org `externalId` are handled by the automated settlement flow. Manually created admin matches remain under admin control.

### Automated odds

`app/api/cron/refresh-odds` recalculates match odds from football data and the project's odds engine.

The endpoint is protected by `CRON_SECRET`.

If you want odds to refresh automatically on a schedule, configure an external scheduler/GitHub Action/cron service to call this endpoint. It is **not currently listed in `vercel.json`**.

## Deposits

The primary deposit flow is Solana wallet based.

Supported deposit assets:

- USDT
- SOL
- NGOAT

The platform values SOL and NGOAT using a live Jupiter price where available, with admin-configured fallback prices if a live price cannot be obtained.

### Deposit verification

The on-chain deposit endpoint independently checks the submitted transaction against Solana.

It verifies:
- The transaction exists and succeeded.
- The claiming wallet controls the wallet through a signed proof.
- The transaction fee payer matches the claiming wallet.
- The transfer reached the NGOAT deposit wallet.
- The transferred asset and amount match the request.
- The transaction hash has not already been credited.
- The deposit meets the minimum USD-equivalent value.

The database also has a unique constraint on `DepositRequest.txHash` to protect against duplicate credits during races.

### Current public Solana addresses

The repository currently defines:

```text
NGOAT deposit wallet:
HjUowGjNtsx3RNy74HkCLxDtdo35o82xvkDD4qr9rfuS

USDT mint:
Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB

NGOAT mint:
8FX8nCzcqK93magyAjvaekPjFQFQJySKoKcd8LJupump
```

These are public blockchain addresses, not secrets. **Verify all addresses independently before moving real funds.**

The default minimum deposit is **$5 USD-equivalent**.

## Withdrawals

Withdrawals support:

- USDT
- SOL
- NGOAT

The amount entered by the user is treated as a **USD-equivalent withdrawal value**. The admin payout process determines the actual token amount at payout time.

### Withdrawal controls

By default:
- Minimum withdrawal: **$10**
- Maximum total withdrawal per day: **$100**
- Withdrawals can be globally enabled/disabled from admin settings.
- A user must reach the configured lifetime approved-deposit threshold before withdrawal options unlock.
- The signup bonus remains protected from withdrawal.
- The first withdrawal permanently links the user's Solana wallet to the account.
- The first withdrawal requires a wallet ownership signature.
- The same wallet cannot be linked to another account.
- A password reset temporarily pauses withdrawals.

The withdrawal system currently creates a request and debits the user's eligible ledger balance; actual payout is handled through the admin withdrawal flow.

## NGC staking

Users can stake NGC for fixed terms.

Default minimum:

```text
40,000 NGC
```

Available terms:

- 3 months
- 6 months
- 1 year

The configured default rate is:

```text
0.01% per day
```

The staking implementation uses **simple interest**, not daily compounding.

At maturity:
1. The principal is returned to the normal spendable balance.
2. The profit is credited separately as `STAKE_PROFIT_RELEASE`.
3. Staked profit can be withdrawn through the dedicated Staked Profit withdrawal option.

There is no early withdrawal from an active stake.

## Games

The project also contains two additional NGC games.

### Spin the Wheel

Route:

```text
/spinthewheel
```

The game uses server-side cryptographically secure randomness.

The default spin cost is:

```text
20,000 NGC
```

Landing on the `BONUS` segment grants a free spin. Free spins are tracked server-side and cannot be fabricated by the client.

The game can be enabled/disabled from admin configuration.

### Number Pick

Route:

```text
/numberpick
```

Players select **3 distinct numbers** from the configured range.

The default range is:

```text
1–20
```

Each user can enter once per weekly draw.

Default minimum stake:

```text
10,000 NGC
```

Payout tiers are based on how many of the 3 selected numbers match the winning numbers:

- 3/3 — Jackpot
- 2/3 — Good payout
- 1/3 — Small payout
- 0/3 — No payout

Draw settlement is handled by:

```text
/api/cron/settle-number-pick
```

The game has both a global games switch and an individual Number Pick switch.

> These games are currently accessible by direct routes and are not treated as the main football-prediction navigation flow.

## Leaderboard

The leaderboard tracks prediction rewards and supports a reset point controlled by:

```text
PlatformConfig.leaderboardResetAt
```

Resetting the leaderboard does **not** remove users' actual NGC balances. It only changes the period used for ranking.

## Admin panel

Admin functionality is available at:

```text
/admin
```

The admin system includes controls for:

- Users
- Deposits
- Withdrawals
- Matches
- Predictions
- Odds
- Ledger entries
- Stakes
- Leaderboard reset
- Number Pick draws
- Game controls
- Platform configuration
- Balance migration/cutover
- Slip reconciliation

Admin access is controlled through the `Role.ADMIN` database role.

There is no public admin-registration flow. An initial admin account must be promoted directly in the database.

## Automated jobs

### Vercel Cron

`vercel.json` currently schedules:

```text
/api/cron/import-fixtures
0 6 * * *

/api/cron/settle-number-pick
5 0 * * *
```

### GitHub Actions

`.github/workflows/settle-results.yml` runs every 15 minutes and calls:

```text
/api/cron/settle-results
/api/cron/release-stakes
```

This is used because frequent execution is not available through a Vercel Hobby cron schedule.

All cron endpoints require:

```text
Authorization: Bearer <CRON_SECRET>
```

## Project structure

```text
app/
├── api/
│   ├── auth/
│   ├── admin/
│   ├── cron/
│   ├── deposits/
│   ├── predictions/
│   ├── games/
│   ├── stakes/
│   ├── withdrawals/
│   ├── leaderboard/
│   └── ...
├── admin/
├── dashboard/
├── predict/
├── predictions/
├── my-predictions/
├── stake/
├── buy-ngoat/
├── withdraw/
├── leaderboard/
├── spinthewheel/
├── numberpick/
├── login/
├── register/
└── ...

components/
lib/
├── ledger.ts
├── settlement.ts
├── staking.ts
├── games.ts
├── markets.ts
├── oddsEngine.ts
├── oddsModel.ts
├── footballData.ts
├── assetPricing.ts
├── security.ts
├── walletProof.ts
├── walletMessages.ts
├── auth.ts
├── authTokens.ts
├── email.ts
└── ...

prisma/
└── schema.prisma
```

## Tech stack

- Next.js 14
- React 18
- TypeScript
- Prisma 5
- PostgreSQL
- NextAuth
- bcryptjs
- Tailwind CSS
- Solana Web3.js
- Solana SPL Token
- Solana Wallet Adapter
- football-data.org
- Jupiter price API
- Resend
- Vercel
- GitHub Actions

## Environment variables

Create a `.env` file locally.

At minimum:

```env
DATABASE_URL="your-postgres-connection"
DIRECT_URL="your-direct-postgres-connection"
NEXTAUTH_SECRET="your-nextauth-secret"
NEXTAUTH_URL="http://localhost:3000"

FOOTBALL_DATA_API_KEY="your-football-data-api-key"
CRON_SECRET="your-cron-secret"

RESEND_API_KEY="your-resend-api-key"
RESEND_FROM_EMAIL="verify@your-verified-domain.com"

NEXT_PUBLIC_SOLANA_RPC_ENDPOINT="your-solana-rpc-endpoint"
```

### Database URLs

`DATABASE_URL` is used by the application.

`DIRECT_URL` is used by Prisma migrations when a direct/non-pooled PostgreSQL connection is required.

Neon and Supabase PostgreSQL can both be used, provided the connection settings are appropriate.

### Solana RPC

The project can fall back to Solana's public RPC, but a dedicated RPC provider is strongly recommended for production deposit verification.

The RPC endpoint may contain a provider key, so **do not commit secrets to the repository**.

## Local development

Install dependencies:

```bash
npm install
```

Generate Prisma client:

```bash
npx prisma generate
```

Run migrations:

```bash
npx prisma migrate dev
```

Start the development server:

```bash
npm run dev
```

The app will normally be available at:

```text
http://localhost:3000
```

## Production deployment

### Vercel

1. Push the repository to GitHub.
2. Import the repository into Vercel.
3. Add all required environment variables.
4. Make sure the production PostgreSQL database is configured.
5. Run production migrations:

```bash
npx prisma migrate deploy
```

6. Promote an account to `ADMIN` directly in the database.
7. Confirm the required cron jobs and GitHub Action secrets are configured.
8. Test deposits, predictions, settlement, staking maturity, and withdrawals before opening the platform to real users.

### GitHub Actions secrets

The settlement workflow expects:

```text
NGOAT_URL
CRON_SECRET
```

`NGOAT_URL` should be the deployed app URL without a trailing slash.

`CRON_SECRET` must exactly match the Vercel environment variable.

## Important production checklist

Before public launch:

- [ ] Verify the Solana deposit wallet.
- [ ] Verify the USDT mint address.
- [ ] Verify the NGOAT mint address.
- [ ] Use a reliable Solana RPC provider.
- [ ] Confirm Resend domain verification and email delivery.
- [ ] Confirm `NEXTAUTH_URL` and `NEXTAUTH_SECRET`.
- [ ] Run all Prisma migrations against production.
- [ ] Create/promote the initial admin account.
- [ ] Review platform rates and fallback asset prices.
- [ ] Review minimum deposits, bets, withdrawals and daily limits.
- [ ] Test a small real Solana deposit.
- [ ] Test duplicate transaction protection.
- [ ] Test wallet ownership signatures.
- [ ] Test a complete prediction settlement.
- [ ] Test cancelled/postponed match handling.
- [ ] Test stake maturity and profit release.
- [ ] Test withdrawal locking and wallet linking.
- [ ] Test password-reset withdrawal hold.
- [ ] Test referral crediting after the first approved deposit.
- [ ] Confirm GitHub Actions are running.
- [ ] Confirm Vercel Cron jobs are running.
- [ ] Configure a scheduler for odds refresh if automatic odds updates are required.
- [ ] Keep the admin account and database credentials secure.

## Important architecture notes

### Never add a raw balance field

Use the ledger helpers instead:

```text
lib/ledger.ts
```

Do not introduce a separate `User.balance` field unless the entire accounting model is deliberately redesigned.

### Never trust client-supplied odds

The prediction API reads the server-side odds stored on the match and rejects stale odds.

### Never trust client-supplied wallet ownership

Deposits and first withdrawals require signed wallet proofs.

### Do not expose private configuration through public APIs

`/api/config` only exposes client-safe configuration. Sensitive/admin configuration belongs behind the admin API.

## Useful commands

```bash
npm run dev
npm run build
npm run start

npx prisma generate
npx prisma migrate dev
npx prisma migrate deploy
```

## License

This project is currently maintained as a private NGOAT application. 
