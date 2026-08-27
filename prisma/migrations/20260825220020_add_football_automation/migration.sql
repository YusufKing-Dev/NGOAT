/*
  Warnings:

  - A unique constraint covering the columns `[externalId]` on the table `Match` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "LedgerType" ADD VALUE 'REFUND';

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "autoSettled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Match_externalId_key" ON "Match"("externalId");
