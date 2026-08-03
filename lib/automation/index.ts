/**
 * Automation constants and core types.
 *
 * The automation actor is a seeded system User row ("Planora Automation") used
 * as the userId when rule-driven mutations write CardHistoryEvent / Activity
 * rows. It has no Account row so sign-in is impossible and is never added as a
 * workspace member. See decision 0022 §5.
 */
export const AUTOMATION_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000a11";
