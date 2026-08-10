-- CreateTable
CREATE TABLE "PayrollPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "paymentType" TEXT NOT NULL DEFAULT 'SALARY',
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentMethod" TEXT NOT NULL DEFAULT 'PAYPAL',
    "notes" TEXT,
    "proofFileName" TEXT,
    "periodLabel" TEXT,
    "periodStart" TEXT,
    "periodEnd" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollPayment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayrollPayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PayrollPayment_shopId_employeeId_createdAt_idx" ON "PayrollPayment"("shopId", "employeeId", "createdAt");
