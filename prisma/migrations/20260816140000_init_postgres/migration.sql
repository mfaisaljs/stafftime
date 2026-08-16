-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('OWNER', 'REGIONAL_MANAGER', 'STORE_MANAGER', 'SUPERVISOR', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('OPEN', 'CLOSED', 'PENDING_APPROVAL');

-- CreateEnum
CREATE TYPE "BreakType" AS ENUM ('PAID', 'UNPAID', 'LUNCH');

-- CreateEnum
CREATE TYPE "MissedPunchType" AS ENUM ('CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END');

-- CreateEnum
CREATE TYPE "MissedPunchStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PayrollExportFormat" AS ENUM ('CSV', 'EXCEL');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "planHandle" TEXT NOT NULL DEFAULT 'free',
    "billingInterval" TEXT NOT NULL DEFAULT 'monthly',
    "staffLimit" INTEGER NOT NULL DEFAULT 2,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'none',
    "trialEndsAt" TIMESTAMP(3),
    "shopifyShopGid" TEXT,
    "reportedStaffUsage" INTEGER NOT NULL DEFAULT 0,
    "usageCycleKey" TEXT,
    "pendingBillingPlanHandle" TEXT,
    "pendingBillingExtraSeats" INTEGER,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreLocation" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyLocationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geofenceRadiusM" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "locationId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "pinHash" TEXT NOT NULL,
    "qrCode" TEXT NOT NULL,
    "role" "EmployeeRole" NOT NULL DEFAULT 'EMPLOYEE',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "firstLoginAt" TIMESTAMP(3),
    "hourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position" TEXT,
    "department" TEXT,
    "locationAccess" TEXT NOT NULL DEFAULT 'ALL',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "payrollType" TEXT NOT NULL DEFAULT 'HOURLY',
    "salaryAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weeklyAvailability" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'PAYPAL',
    "paypalEmail" TEXT,
    "paypalAccountName" TEXT,
    "bankAccountType" TEXT,
    "bankName" TEXT,
    "accountHolderName" TEXT,
    "accountNumber" TEXT,
    "routingNumber" TEXT,
    "swiftBic" TEXT,
    "iban" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionProgram" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "commissionType" TEXT NOT NULL DEFAULT 'fixed',
    "afterDiscount" BOOLEAN NOT NULL DEFAULT true,
    "limitedTime" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TEXT,
    "endDate" TEXT,
    "productScope" TEXT NOT NULL DEFAULT 'all',
    "allProductsCommission" DOUBLE PRECISION,
    "productCommissions" TEXT NOT NULL DEFAULT '[]',
    "employeeIds" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionAttribution" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT,
    "orderFinancialStatus" TEXT NOT NULL DEFAULT 'PAID',
    "payoutStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "commissionTotal" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "programIds" TEXT NOT NULL DEFAULT '[]',
    "lineItemsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesTarget" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "employeeIds" TEXT NOT NULL DEFAULT '[]',
    "locationIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesTargetSnapshot" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "soldAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTargetSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesTargetAttribution" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "yearMonth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTargetAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "clockInAt" TIMESTAMP(3) NOT NULL,
    "clockOutAt" TIMESTAMP(3),
    "status" "TimeEntryStatus" NOT NULL DEFAULT 'OPEN',
    "hourlyRateSnapshot" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'POS',
    "deviceId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "photoUrl" TEXT,
    "clockOutPhotoUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakEntry" (
    "id" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "type" "BreakType" NOT NULL DEFAULT 'UNPAID',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BreakEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissedPunchRequest" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "MissedPunchType" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "MissedPunchStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissedPunchRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'system',
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "previous" TEXT,
    "next" TEXT,
    "ipAddress" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "locationId" TEXT,
    "name" TEXT NOT NULL,
    "deviceKey" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollExport" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "format" "PayrollExportFormat" NOT NULL DEFAULT 'CSV',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "filePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPayment" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "paymentType" TEXT NOT NULL DEFAULT 'SALARY',
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentMethod" TEXT NOT NULL DEFAULT 'PAYPAL',
    "notes" TEXT,
    "proofFileName" TEXT,
    "periodLabel" TEXT,
    "periodStart" TEXT,
    "periodEnd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskList" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignStaff" BOOLEAN NOT NULL DEFAULT false,
    "assignManagers" BOOLEAN NOT NULL DEFAULT false,
    "staffScope" TEXT NOT NULL DEFAULT 'ALL',
    "managerScope" TEXT NOT NULL DEFAULT 'ALL',
    "employeeIds" TEXT NOT NULL DEFAULT '[]',
    "managerIds" TEXT NOT NULL DEFAULT '[]',
    "locationAccess" TEXT NOT NULL DEFAULT 'ALL',
    "locationIds" TEXT NOT NULL DEFAULT '[]',
    "timelines" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskListItem" (
    "id" TEXT NOT NULL,
    "taskListId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskListCompletion" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "taskListId" TEXT NOT NULL,
    "taskItemId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "performedBy" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskListCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeOffPolicy" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "policyType" TEXT NOT NULL DEFAULT 'TIME_OFF',
    "compensation" TEXT NOT NULL DEFAULT 'UNPAID',
    "fullDayDuration" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "employeeIds" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeOffPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeOffRequest" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "locationId" TEXT,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeOffRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "overtimeDailyHours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "overtimeWeeklyHours" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "maxHoursPerDay" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "maxHoursPerWeek" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "mandatoryBreakHours" DOUBLE PRECISION NOT NULL DEFAULT 6,
    "mandatoryBreakMinutes" INTEGER NOT NULL DEFAULT 30,
    "requireGps" BOOLEAN NOT NULL DEFAULT false,
    "requirePhoto" BOOLEAN NOT NULL DEFAULT false,
    "scheduleLocationColors" TEXT NOT NULL DEFAULT '{}',
    "scheduleStaffColors" TEXT NOT NULL DEFAULT '{}',
    "deductBreakTime" BOOLEAN NOT NULL DEFAULT true,
    "salaryAfterFirstClockIn" BOOLEAN NOT NULL DEFAULT true,
    "blockBreakAfterEndTime" BOOLEAN NOT NULL DEFAULT false,
    "allowEarlyClockIn" BOOLEAN NOT NULL DEFAULT true,
    "earlyClockInMinutes" INTEGER NOT NULL DEFAULT 30,
    "showPayrollStatsInPos" BOOLEAN NOT NULL DEFAULT true,
    "timeFormat" TEXT NOT NULL DEFAULT '24H',
    "hourFormat" TEXT NOT NULL DEFAULT 'STANDARD',
    "excludePaidLeavesFromAbsences" BOOLEAN NOT NULL DEFAULT true,
    "includeUnpaidLeavesInAbsences" BOOLEAN NOT NULL DEFAULT true,
    "autoAddPaidLeavesToSalary" BOOLEAN NOT NULL DEFAULT true,
    "autoDeductUnpaidLeavesFromSalary" BOOLEAN NOT NULL DEFAULT true,
    "autoDeductAbsencesFromSalary" BOOLEAN NOT NULL DEFAULT true,
    "defaultDailyWorkingHours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "holidayWeekdays" TEXT NOT NULL DEFAULT '["SUNDAY"]',
    "portalClockIn" BOOLEAN NOT NULL DEFAULT true,
    "portalManagerView" BOOLEAN NOT NULL DEFAULT true,
    "portalTimeOff" BOOLEAN NOT NULL DEFAULT true,
    "portalProfileShifts" BOOLEAN NOT NULL DEFAULT true,
    "portalTaskList" BOOLEAN NOT NULL DEFAULT true,
    "portalViewShifts" BOOLEAN NOT NULL DEFAULT true,
    "portalTimesheet" BOOLEAN NOT NULL DEFAULT true,
    "portalCreateShift" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_domain_key" ON "Shop"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "StoreLocation_shopId_shopifyLocationId_key" ON "StoreLocation"("shopId", "shopifyLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_qrCode_key" ON "Employee"("qrCode");

-- CreateIndex
CREATE INDEX "Employee_shopId_status_idx" ON "Employee"("shopId", "status");

-- CreateIndex
CREATE INDEX "Shift_shopId_startsAt_idx" ON "Shift"("shopId", "startsAt");

-- CreateIndex
CREATE INDEX "Shift_employeeId_startsAt_idx" ON "Shift"("employeeId", "startsAt");

-- CreateIndex
CREATE INDEX "Shift_shopId_status_startsAt_idx" ON "Shift"("shopId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "CommissionProgram_shopId_createdAt_idx" ON "CommissionProgram"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionAttribution_shopId_employeeId_createdAt_idx" ON "CommissionAttribution"("shopId", "employeeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionAttribution_shopId_orderId_key" ON "CommissionAttribution"("shopId", "orderId");

-- CreateIndex
CREATE INDEX "SalesTarget_shopId_yearMonth_idx" ON "SalesTarget"("shopId", "yearMonth");

-- CreateIndex
CREATE INDEX "SalesTargetSnapshot_shopId_employeeId_yearMonth_idx" ON "SalesTargetSnapshot"("shopId", "employeeId", "yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTargetSnapshot_shopId_employeeId_yearMonth_key" ON "SalesTargetSnapshot"("shopId", "employeeId", "yearMonth");

-- CreateIndex
CREATE INDEX "SalesTargetAttribution_shopId_employeeId_yearMonth_idx" ON "SalesTargetAttribution"("shopId", "employeeId", "yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTargetAttribution_shopId_orderId_key" ON "SalesTargetAttribution"("shopId", "orderId");

-- CreateIndex
CREATE INDEX "TimeEntry_shopId_clockInAt_idx" ON "TimeEntry"("shopId", "clockInAt");

-- CreateIndex
CREATE INDEX "TimeEntry_employeeId_status_idx" ON "TimeEntry"("employeeId", "status");

-- CreateIndex
CREATE INDEX "BreakEntry_timeEntryId_endedAt_idx" ON "BreakEntry"("timeEntryId", "endedAt");

-- CreateIndex
CREATE INDEX "MissedPunchRequest_shopId_status_idx" ON "MissedPunchRequest"("shopId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_shopId_createdAt_idx" ON "AuditLog"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Device_deviceKey_key" ON "Device"("deviceKey");

-- CreateIndex
CREATE INDEX "Device_shopId_approved_idx" ON "Device"("shopId", "approved");

-- CreateIndex
CREATE INDEX "PayrollPayment_shopId_employeeId_createdAt_idx" ON "PayrollPayment"("shopId", "employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskList_shopId_createdAt_idx" ON "TaskList"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskListItem_taskListId_sortOrder_idx" ON "TaskListItem"("taskListId", "sortOrder");

-- CreateIndex
CREATE INDEX "TaskListCompletion_taskListId_dateKey_idx" ON "TaskListCompletion"("taskListId", "dateKey");

-- CreateIndex
CREATE INDEX "TaskListCompletion_shopId_dateKey_idx" ON "TaskListCompletion"("shopId", "dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "TaskListCompletion_taskItemId_dateKey_key" ON "TaskListCompletion"("taskItemId", "dateKey");

-- CreateIndex
CREATE INDEX "TimeOffPolicy_shopId_createdAt_idx" ON "TimeOffPolicy"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "TimeOffRequest_shopId_status_createdAt_idx" ON "TimeOffRequest"("shopId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TimeOffRequest_employeeId_startDate_idx" ON "TimeOffRequest"("employeeId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_shopId_key" ON "Setting"("shopId");

-- AddForeignKey
ALTER TABLE "StoreLocation" ADD CONSTRAINT "StoreLocation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionProgram" ADD CONSTRAINT "CommissionProgram_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionAttribution" ADD CONSTRAINT "CommissionAttribution_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTarget" ADD CONSTRAINT "SalesTarget_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTargetSnapshot" ADD CONSTRAINT "SalesTargetSnapshot_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTargetAttribution" ADD CONSTRAINT "SalesTargetAttribution_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakEntry" ADD CONSTRAINT "BreakEntry_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissedPunchRequest" ADD CONSTRAINT "MissedPunchRequest_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissedPunchRequest" ADD CONSTRAINT "MissedPunchRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollExport" ADD CONSTRAINT "PayrollExport_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPayment" ADD CONSTRAINT "PayrollPayment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPayment" ADD CONSTRAINT "PayrollPayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskList" ADD CONSTRAINT "TaskList_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskListItem" ADD CONSTRAINT "TaskListItem_taskListId_fkey" FOREIGN KEY ("taskListId") REFERENCES "TaskList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskListCompletion" ADD CONSTRAINT "TaskListCompletion_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskListCompletion" ADD CONSTRAINT "TaskListCompletion_taskListId_fkey" FOREIGN KEY ("taskListId") REFERENCES "TaskList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskListCompletion" ADD CONSTRAINT "TaskListCompletion_taskItemId_fkey" FOREIGN KEY ("taskItemId") REFERENCES "TaskListItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOffPolicy" ADD CONSTRAINT "TimeOffPolicy_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOffRequest" ADD CONSTRAINT "TimeOffRequest_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOffRequest" ADD CONSTRAINT "TimeOffRequest_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "TimeOffPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
