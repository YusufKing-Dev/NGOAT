/*
  Warnings:

  - A unique constraint covering the columns `[txHash]` on the table `DepositRequest` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `slipId` to the `Prediction` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StakeDuration" AS ENUM ('THREE_MONTHS', 'SIX_MONTHS', 'ONE_YEAR');

-- CreateEnum
CREATE TYPE "StakeStatus" AS ENUM ('ACTIVE', 'MATURED', 'RELEASED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerType" ADD VALUE 'STAKE_LOCK';
ALTER TYPE "LedgerType" ADD VALUE 'STAKE_RELEASE';

-- AlterTable
ALTER TABLE "DepositRequest" ADD COLUMN     "autoVerified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PlatformConfig" ADD COLUMN     "maxDailyWithdrawalUsdt" DOUBLE PRECISION NOT NULL DEFAULT 100,
ADD COLUMN     "minSlipLegs" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "minWithdrawalUsdt" DOUBLE PRECISION NOT NULL DEFAULT 5,
ADD COLUMN     "solanaRpcEndpoint" TEXT,
ADD COLUMN     "solanaUsdtMint" TEXT,
ADD COLUMN     "stakingDailyRatePct" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
ADD COLUMN     "stakingMinCredits" INTEGER NOT NULL DEFAULT 40000;

-- AlterTable
ALTER TABLE "Prediction" ADD COLUMN     "slipId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bonusFloor" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PredictionSlip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stake" INTEGER NOT NULL,
    "status" "PredictionStatus" NOT NULL DEFAULT 'PENDING',
    "reward" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredictionSlip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stake" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "principal" INTEGER NOT NULL,
    "duration" "StakeDuration" NOT NULL,
    "dailyRatePct" DOUBLE PRECISION NOT NULL,
    "status" "StakeStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maturesAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "releaseAmount" INTEGER,

    CONSTRAINT "Stake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepositRequest_txHash_key" ON "DepositRequest"("txHash");

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_slipId_fkey" FOREIGN KEY ("slipId") REFERENCES "PredictionSlip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionSlip" ADD CONSTRAINT "PredictionSlip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stake" ADD CONSTRAINT "Stake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
