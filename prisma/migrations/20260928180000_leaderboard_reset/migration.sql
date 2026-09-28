-- Leaderboard season reset point. Null = all-time (current behavior).
-- Setting this to a timestamp makes /api/leaderboard only count
-- PREDICTION_REWARD ledger entries from that point on — nobody's
-- actual NGC balance is touched, only the rankings reset.

ALTER TABLE "PlatformConfig" ADD COLUMN "leaderboardResetAt" TIMESTAMP(3);