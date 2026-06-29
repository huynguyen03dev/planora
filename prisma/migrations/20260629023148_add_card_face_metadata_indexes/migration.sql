-- CreateIndex
CREATE INDEX "checklist_cardId_idx" ON "checklist"("cardId");

-- CreateIndex
CREATE INDEX "checklistItem_checklistId_idx" ON "checklistItem"("checklistId");

-- CreateIndex
CREATE INDEX "comment_cardId_idx" ON "comment"("cardId");
