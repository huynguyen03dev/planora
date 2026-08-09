-- AlterTable
ALTER TABLE "card" ADD COLUMN     "moveRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "list" ADD COLUMN     "moveRevision" INTEGER NOT NULL DEFAULT 0;
