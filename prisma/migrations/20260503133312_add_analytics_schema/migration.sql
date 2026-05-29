-- CreateEnum
CREATE TYPE "CardHistoryEventType" AS ENUM ('CARD_CREATED', 'CARD_MOVED', 'CARD_COMPLETED', 'CARD_REOPENED', 'ESTIMATE_SET', 'ESTIMATE_CHANGED', 'DUE_DATE_SET', 'DUE_DATE_CHANGED', 'DUE_DATE_CLEARED', 'CARD_MEMBER_ASSIGNED', 'CARD_MEMBER_UNASSIGNED', 'CARD_ARCHIVED', 'CARD_RESTORED', 'CARD_DELETED', 'BASELINE_CAPTURED');

-- AlterTable
ALTER TABLE "card" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "estimateHours" INTEGER;

-- AlterTable
ALTER TABLE "list" ADD COLUMN     "isDone" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "analyticsLaunchAt" TIMESTAMP(3),
ADD COLUMN     "requireEstimateBeforeDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- CreateTable
CREATE TABLE "cardHistoryEvent" (
    "id" TEXT NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" "CardHistoryEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "cardHistoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cardHistoryEvent_workspaceId_occurredAt_idx" ON "cardHistoryEvent"("workspaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "cardHistoryEvent_workspaceId_boardId_occurredAt_idx" ON "cardHistoryEvent"("workspaceId", "boardId", "occurredAt");

-- CreateIndex
CREATE INDEX "cardHistoryEvent_cardId_sequence_idx" ON "cardHistoryEvent"("cardId", "sequence");

-- CreateIndex
CREATE INDEX "cardHistoryEvent_workspaceId_eventType_occurredAt_idx" ON "cardHistoryEvent"("workspaceId", "eventType", "occurredAt");

-- AddForeignKey
ALTER TABLE "cardHistoryEvent" ADD CONSTRAINT "cardHistoryEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- NOTE: no FK to card on purpose so history survives hard deletes of cards/lists.
