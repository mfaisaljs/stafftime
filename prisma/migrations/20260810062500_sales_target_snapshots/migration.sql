-- CreateTable
CREATE TABLE "SalesTargetSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "soldAmount" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesTargetSnapshot_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SalesTargetSnapshot_shopId_employeeId_yearMonth_idx" ON "SalesTargetSnapshot"("shopId", "employeeId", "yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTargetSnapshot_shopId_employeeId_yearMonth_key" ON "SalesTargetSnapshot"("shopId", "employeeId", "yearMonth");
