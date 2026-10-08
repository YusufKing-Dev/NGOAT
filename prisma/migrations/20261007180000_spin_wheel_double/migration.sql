-- Spin the Wheel: stake doubled from 10,000 to 20,000 NGC.
ALTER TABLE "PlatformConfig" ALTER COLUMN "spinCostNgc" SET DEFAULT 20000;
UPDATE "PlatformConfig" SET "spinCostNgc" = 20000 WHERE "spinCostNgc" = 10000;