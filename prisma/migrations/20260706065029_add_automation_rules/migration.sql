-- CreateTable
CREATE TABLE "rule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "boardId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "triggerType" TEXT NOT NULL,
    "triggerConfig" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ruleExecutionLog" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "chainId" TEXT,
    "chainDepth" INTEGER NOT NULL DEFAULT 0,
    "cardId" TEXT,
    "actionType" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "dedupKey" TEXT,
    "metadata" JSONB,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ruleExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rule_workspaceId_triggerType_idx" ON "rule"("workspaceId", "triggerType");

-- CreateIndex
CREATE INDEX "rule_workspaceId_enabled_idx" ON "rule"("workspaceId", "enabled");

-- CreateIndex
CREATE INDEX "ruleExecutionLog_ruleId_executedAt_idx" ON "ruleExecutionLog"("ruleId", "executedAt");

-- CreateIndex
CREATE INDEX "ruleExecutionLog_cardId_idx" ON "ruleExecutionLog"("cardId");

-- CreateIndex
CREATE INDEX "ruleExecutionLog_chainId_idx" ON "ruleExecutionLog"("chainId");

-- CreateIndex
CREATE UNIQUE INDEX "ruleExecutionLog_ruleId_dedupKey_key" ON "ruleExecutionLog"("ruleId", "dedupKey");

-- AddForeignKey
ALTER TABLE "rule" ADD CONSTRAINT "rule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule" ADD CONSTRAINT "rule_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule" ADD CONSTRAINT "rule_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ruleExecutionLog" ADD CONSTRAINT "ruleExecutionLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: automation actor system user (decision 0022 §5)
-- No Account row → sign-in impossible; never a workspace member.
INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
VALUES (
  '00000000-0000-4000-8000-000000000a11',
  'Planora Automation',
  'automation@planora.internal',
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;
