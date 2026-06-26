-- CreateTable
CREATE TABLE "cardReminder" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "milestone" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cardReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cardReminder_cardId_idx" ON "cardReminder"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "cardReminder_cardId_userId_milestone_key" ON "cardReminder"("cardId", "userId", "milestone");

-- CreateIndex
CREATE INDEX "card_dueDate_completedAt_idx" ON "card"("dueDate", "completedAt");

-- AddForeignKey
ALTER TABLE "cardReminder" ADD CONSTRAINT "cardReminder_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
