-- CreateTable
CREATE TABLE "TaskListCompletion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "taskListId" TEXT NOT NULL,
    "taskItemId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "performedBy" TEXT,
    "performedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskListCompletion_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskListCompletion_taskListId_fkey" FOREIGN KEY ("taskListId") REFERENCES "TaskList" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskListCompletion_taskItemId_fkey" FOREIGN KEY ("taskItemId") REFERENCES "TaskListItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TaskListCompletion_taskListId_dateKey_idx" ON "TaskListCompletion"("taskListId", "dateKey");

-- CreateIndex
CREATE INDEX "TaskListCompletion_shopId_dateKey_idx" ON "TaskListCompletion"("shopId", "dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "TaskListCompletion_taskItemId_dateKey_key" ON "TaskListCompletion"("taskItemId", "dateKey");
