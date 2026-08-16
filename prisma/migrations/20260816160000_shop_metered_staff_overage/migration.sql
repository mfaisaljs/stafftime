-- Separate subscribed extra seats from metered staff overage.
ALTER TABLE "Shop" ADD COLUMN "meteredStaffOverage" INTEGER NOT NULL DEFAULT 0;
