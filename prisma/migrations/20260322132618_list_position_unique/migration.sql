-- Enforce unique list ordering key per board
CREATE UNIQUE INDEX "list_boardId_position_key" ON "list"("boardId", "position");
