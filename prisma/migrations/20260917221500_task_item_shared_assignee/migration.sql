-- AlterTable
ALTER TABLE "TaskListItem" ADD COLUMN "shared" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "TaskListCompletion" ADD COLUMN "assigneeKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TaskListCompletion" ADD COLUMN "employeeId" TEXT;

-- DropIndex
DROP INDEX "TaskListCompletion_taskItemId_dateKey_key";

-- CreateIndex
CREATE UNIQUE INDEX "TaskListCompletion_taskItemId_dateKey_assigneeKey_key" ON "TaskListCompletion"("taskItemId", "dateKey", "assigneeKey");

-- CreateIndex
CREATE INDEX "TaskListCompletion_employeeId_idx" ON "TaskListCompletion"("employeeId");

-- AddForeignKey
ALTER TABLE "TaskListCompletion" ADD CONSTRAINT "TaskListCompletion_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
