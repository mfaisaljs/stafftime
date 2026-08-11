-- Add shift status for leave-driven cancellations (SCHEDULED | CANCELLED_LEAVE)
ALTER TABLE "Shift" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SCHEDULED';

CREATE INDEX "Shift_shopId_status_startsAt_idx" ON "Shift"("shopId", "status", "startsAt");
