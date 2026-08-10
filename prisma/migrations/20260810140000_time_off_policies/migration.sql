-- CreateTable
CREATE TABLE "TimeOffPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "policyType" TEXT NOT NULL DEFAULT 'TIME_OFF',
    "compensation" TEXT NOT NULL DEFAULT 'UNPAID',
    "fullDayDuration" REAL NOT NULL DEFAULT 8,
    "employeeIds" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeOffPolicy_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TimeOffPolicy_shopId_createdAt_idx" ON "TimeOffPolicy"("shopId", "createdAt");
