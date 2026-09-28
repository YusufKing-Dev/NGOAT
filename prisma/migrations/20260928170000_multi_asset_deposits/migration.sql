-- Multi-asset deposits/withdrawals: USDT, SOL, NGOAT.
-- usdtAmount on both request tables is repurposed to mean "USD-equivalent
-- value of whatever `asset` was sent", not literally USDT — see
-- lib/assetPricing.ts. No data migration needed: every existing row is
-- already USDT-denominated, and the new `asset` column defaults to USDT
-- for them, which is exactly correct.

CREATE TYPE "Asset" AS ENUM ('USDT', 'SOL', 'NGOAT');

ALTER TABLE "DepositRequest" ADD COLUMN "asset" "Asset" NOT NULL DEFAULT 'USDT';
ALTER TABLE "WithdrawalRequest" ADD COLUMN "asset" "Asset" NOT NULL DEFAULT 'USDT';

ALTER TABLE "PlatformConfig"
  ADD COLUMN "solPriceUsdFallback" DOUBLE PRECISION NOT NULL DEFAULT 150,
  ADD COLUMN "ngoatPriceUsdFallback" DOUBLE PRECISION NOT NULL DEFAULT 0.00005;