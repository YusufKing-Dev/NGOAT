-- AlterEnum
ALTER TYPE "LedgerType" ADD VALUE 'STAKE_PROFIT_RELEASE';

-- AlterTable
ALTER TABLE "PlatformConfig" ALTER COLUMN     "stakingDailyRatePct" SET DEFAULT 0.01,
ALTER COLUMN     "minDeposit" SET DEFAULT 10,
ALTER COLUMN     "maxDeposit" SET DEFAULT 10000,
ALTER COLUMN     "minWithdrawalUsdt" SET DEFAULT 10,
ADD COLUMN     "withdrawalUnlockDepositCredits" INTEGER NOT NULL DEFAULT 20000,
ADD COLUMN     "balanceMigrationCompleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Stake" ADD COLUMN     "profitAmount" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totalApprovedDepositCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "autoStakedAt" TIMESTAMP(3);

-- Apply the new numbers to the live singleton config row too, not
-- just future defaults — that row already exists, so the column
-- DEFAULTs above only ever apply to brand-new rows, never this one.
UPDATE "PlatformConfig" SET
  "stakingDailyRatePct" = 0.01,
  "minDeposit" = 10,
  "maxDeposit" = 10000,
  "minWithdrawalUsdt" = 10
WHERE "id" = 'singleton';