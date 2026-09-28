-- AlterEnum (idempotent: safe if the label was already added)
ALTER TYPE "LedgerType" ADD VALUE IF NOT EXISTS 'STAKE_PROFIT_RELEASE';

-- AlterTable
ALTER TABLE "PlatformConfig" ALTER COLUMN     "stakingDailyRatePct" SET DEFAULT 0.01,
ALTER COLUMN     "minDeposit" SET DEFAULT 10,
ALTER COLUMN     "maxDeposit" SET DEFAULT 10000,
ALTER COLUMN     "minWithdrawalUsdt" SET DEFAULT 10,
ADD COLUMN IF NOT EXISTS     "withdrawalUnlockDepositCredits" INTEGER NOT NULL DEFAULT 20000,
ADD COLUMN IF NOT EXISTS     "balanceMigrationCompleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Stake" ADD COLUMN IF NOT EXISTS     "profitAmount" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS     "totalApprovedDepositCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS     "autoStakedAt" TIMESTAMP(3);

-- Apply the new numbers to the live singleton config row too.
UPDATE "PlatformConfig" SET
  "stakingDailyRatePct" = 0.01,
  "minDeposit" = 10,
  "maxDeposit" = 10000,
  "minWithdrawalUsdt" = 10
WHERE "id" = 'singleton';