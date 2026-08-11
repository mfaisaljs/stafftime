-- CreateTable
CREATE TABLE "CommissionAttribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT,
    "commissionTotal" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "programIds" TEXT NOT NULL DEFAULT '[]',
    "lineItemsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommissionAttribution_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CommissionAttribution_shopId_employeeId_createdAt_idx" ON "CommissionAttribution"("shopId", "employeeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionAttribution_shopId_orderId_key" ON "CommissionAttribution"("shopId", "orderId");
