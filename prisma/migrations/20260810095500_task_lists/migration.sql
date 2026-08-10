-- CreateTable
CREATE TABLE "TaskList" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "assignStaff" BOOLEAN NOT NULL DEFAULT false,
    "assignManagers" BOOLEAN NOT NULL DEFAULT false,
    "employeeIds" TEXT NOT NULL DEFAULT '[]',
    "locationAccess" TEXT NOT NULL DEFAULT 'ALL',
    "locationIds" TEXT NOT NULL DEFAULT '[]',
    "timelines" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskList_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskListItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskListId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskListItem_taskListId_fkey" FOREIGN KEY ("taskListId") REFERENCES "TaskList" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TaskList_shopId_createdAt_idx" ON "TaskList"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskListItem_taskListId_sortOrder_idx" ON "TaskListItem"("taskListId", "sortOrder");
