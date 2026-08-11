-- CreateTable
CREATE TABLE "SalesTargetAttribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "yearMonth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesTargetAttribution_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SalesTargetAttribution_shopId_employeeId_yearMonth_idx" ON "SalesTargetAttribution"("shopId", "employeeId", "yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTargetAttribution_shopId_orderId_key" ON "SalesTargetAttribution"("shopId", "orderId");
