# Usability study protocol

## Status

Protocol and interactive harness implemented. Real participant data is pending.

## Quick run

```bash
npm run study:usability
```

Recruit 3–5 participants. For each participant, record only observed data in the harness:

1. Create a workspace and board.
2. Create a list and three cards.
3. Move a card between lists.
4. Assign a member and add a due date.
5. Find and edit a card from the board.

Record completion time, success/failure, error count, notes, and ease from 1 to 5. Do not infer participant results from automated tests. Output is append-only JSONL at `docs/evidence/usability-study.jsonl`.
