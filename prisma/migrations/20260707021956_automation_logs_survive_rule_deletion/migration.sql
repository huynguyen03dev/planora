-- Execution logs now survive rule deletion: denormalize workspaceId + ruleName
-- onto the log, make ruleId nullable, and switch the rule FK to ON DELETE SET
-- NULL (was CASCADE). Backfills existing rows from the parent rule before
-- enforcing NOT NULL so this is safe to `migrate deploy` against populated data.

-- DropForeignKey (was ON DELETE CASCADE)
ALTER TABLE "ruleExecutionLog" DROP CONSTRAINT "ruleExecutionLog_ruleId_fkey";

-- AlterTable: add denormalized columns as NULLable first, relax ruleId
ALTER TABLE "ruleExecutionLog" ADD COLUMN "ruleName" TEXT,
ADD COLUMN "workspaceId" TEXT,
ALTER COLUMN "ruleId" DROP NOT NULL;

-- Backfill denormalized columns from the still-present parent rule
UPDATE "ruleExecutionLog" AS log
SET "workspaceId" = r."workspaceId",
    "ruleName" = r."name"
FROM "rule" AS r
WHERE log."ruleId" = r."id";

-- Enforce NOT NULL now that every row is backfilled (any pre-existing orphan
-- rows are impossible under the old CASCADE, so none can remain null)
ALTER TABLE "ruleExecutionLog" ALTER COLUMN "ruleName" SET NOT NULL,
ALTER COLUMN "workspaceId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ruleExecutionLog_workspaceId_executedAt_idx" ON "ruleExecutionLog"("workspaceId", "executedAt");

-- AddForeignKey: workspace scope (CASCADE — deleting a workspace clears its logs)
ALTER TABLE "ruleExecutionLog" ADD CONSTRAINT "ruleExecutionLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: rule link now SET NULL so logs outlive their rule
ALTER TABLE "ruleExecutionLog" ADD CONSTRAINT "ruleExecutionLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
