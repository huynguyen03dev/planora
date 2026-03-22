-- Drop redundant non-unique index now covered by unique index on same key
DROP INDEX IF EXISTS "list_boardId_position_idx";
