-- AlterTable
ALTER TABLE "attachment" ADD COLUMN     "cloudinaryPublicId" TEXT,
ADD COLUMN     "cloudinaryResourceType" TEXT;

-- CreateIndex
CREATE INDEX "attachment_cardId_idx" ON "attachment"("cardId");
