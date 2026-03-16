/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,userId]` on the table `workspaceMember` will be added. If there are existing duplicate values, this will fail.
  - Made the column `role` on table `invitation` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "invitation" ALTER COLUMN "role" SET NOT NULL;

-- AlterTable
ALTER TABLE "workspaceMember" ALTER COLUMN "role" SET DEFAULT 'viewer';

-- CreateIndex
CREATE UNIQUE INDEX "workspaceMember_organizationId_userId_key" ON "workspaceMember"("organizationId", "userId");
