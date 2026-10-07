-- Odds + markets for football predictions.

-- Match: team lookup info + published odds
ALTER TABLE "Match"
  ADD COLUMN "competitionCode" TEXT,
  ADD COLUMN "homeTeamExtId" INTEGER,
  ADD COLUMN "awayTeamExtId" INTEGER,
  ADD COLUMN "odds" JSONB,
  ADD COLUMN "oddsManual" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "oddsUpdatedAt" TIMESTAMP(3);

-- Prediction: market picks with locked-in odds. Old rows keep working:
-- market defaults to '1X2' and the old `pick` column stays (now nullable).
ALTER TABLE "Prediction" ALTER COLUMN "pick" DROP NOT NULL;
ALTER TABLE "Prediction"
  ADD COLUMN "market" TEXT NOT NULL DEFAULT '1X2',
  ADD COLUMN "selection" TEXT,
  ADD COLUMN "line" DOUBLE PRECISION,
  ADD COLUMN "odds" DOUBLE PRECISION;

-- A user can now back several markets on the same match.
DROP INDEX "Prediction_userId_matchId_key";
CREATE INDEX "Prediction_userId_matchId_idx" ON "Prediction"("userId", "matchId");
CREATE INDEX "Prediction_matchId_idx" ON "Prediction"("matchId");

-- Slips: flag odds-based ones (existing slips stay on the old formula)
ALTER TABLE "PredictionSlip"
  ADD COLUMN "oddsBased" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "totalOdds" DOUBLE PRECISION;

-- Platform config: odds margin + new minimum stake of 10,000 NGC
ALTER TABLE "PlatformConfig" ADD COLUMN "oddsMargin" DOUBLE PRECISION NOT NULL DEFAULT 0.07;
ALTER TABLE "PlatformConfig" ALTER COLUMN "minBetCredits" SET DEFAULT 10000;
UPDATE "PlatformConfig" SET "minBetCredits" = 10000 WHERE "minBetCredits" < 10000;