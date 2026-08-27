/*
  Warnings:

  - You are about to drop the column `maxBetCredits` on the `PlatformConfig` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PlatformConfig" DROP COLUMN "maxBetCredits",
ADD COLUMN     "rewardMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.8,
ALTER COLUMN "minBetCredits" SET DEFAULT 5000;
