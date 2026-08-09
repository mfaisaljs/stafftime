-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "locationId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "pinHash" TEXT NOT NULL,
    "qrCode" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "hourlyRate" REAL NOT NULL DEFAULT 0,
    "position" TEXT,
    "department" TEXT,
    "locationAccess" TEXT NOT NULL DEFAULT 'ALL',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "payrollType" TEXT NOT NULL DEFAULT 'HOURLY',
    "salaryAmount" REAL NOT NULL DEFAULT 0,
    "weeklyAvailability" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'PAYPAL',
    "paypalEmail" TEXT,
    "paypalAccountName" TEXT,
    "bankAccountType" TEXT,
    "bankName" TEXT,
    "accountHolderName" TEXT,
    "accountNumber" TEXT,
    "routingNumber" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Employee_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Employee" ("createdAt", "department", "email", "firstName", "hourlyRate", "id", "lastName", "locationId", "pinHash", "qrCode", "role", "shopId", "status", "updatedAt") SELECT "createdAt", "department", "email", "firstName", "hourlyRate", "id", "lastName", "locationId", "pinHash", "qrCode", "role", "shopId", "status", "updatedAt" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE UNIQUE INDEX "Employee_qrCode_key" ON "Employee"("qrCode");
CREATE INDEX "Employee_shopId_status_idx" ON "Employee"("shopId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
