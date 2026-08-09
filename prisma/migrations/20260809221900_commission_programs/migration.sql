-- CreateTable
CREATE TABLE "CommissionProgram" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "commissionType" TEXT NOT NULL DEFAULT 'fixed',
    "afterDiscount" BOOLEAN NOT NULL DEFAULT true,
    "limitedTime" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TEXT,
    "endDate" TEXT,
    "productScope" TEXT NOT NULL DEFAULT 'all',
    "allProductsCommission" REAL,
    "productCommissions" TEXT NOT NULL DEFAULT '[]',
    "employeeIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommissionProgram_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CommissionProgram_shopId_createdAt_idx" ON "CommissionProgram"("shopId", "createdAt");
