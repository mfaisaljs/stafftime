-- Add persisted schedule color overrides for locations and staff.
ALTER TABLE "Setting" ADD COLUMN "scheduleLocationColors" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Setting" ADD COLUMN "scheduleStaffColors" TEXT NOT NULL DEFAULT '{}';
