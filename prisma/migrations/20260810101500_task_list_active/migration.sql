-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TaskList" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskList_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TaskList" ("id", "shopId", "name", "description", "active", "assignStaff", "assignManagers", "staffScope", "managerScope", "employeeIds", "managerIds", "locationAccess", "locationIds", "timelines", "createdAt", "updatedAt")
SELECT "id", "shopId", "name", "description", 1, "assignStaff", "assignManagers", "staffScope", "managerScope", "employeeIds", "managerIds", "locationAccess", "locationIds", "timelines", "createdAt", "updatedAt" FROM "TaskList";
DROP TABLE "TaskList";
ALTER TABLE "new_TaskList" RENAME TO "TaskList";
CREATE INDEX "TaskList_shopId_createdAt_idx" ON "TaskList"("shopId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
