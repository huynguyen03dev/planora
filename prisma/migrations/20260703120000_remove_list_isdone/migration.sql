-- Drop List.isDone. Completion is card-owned via Card.completedAt (US-045 /
-- decision 0020); list membership no longer derives completion. This drops no
-- card completion state: every currently-complete card already has completedAt
-- materialized, and any card sitting in a former "done" list with a null
-- completedAt already rendered as incomplete.
ALTER TABLE "list" DROP COLUMN "isDone";
