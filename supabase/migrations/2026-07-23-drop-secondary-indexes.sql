-- This project's storage has repeatedly corrupted members_group_id_idx,
-- making freshly saved members invisible to index scans while the rows
-- themselves were fine (a reindex fixed it, then it came back). These tables
-- stay tiny, a friend group is a handful of rows, so sequential scans are
-- effectively free and cannot be corrupted. The secondary indexes go.
-- Recreate them only if a table ever grows past tens of thousands of rows.

drop index if exists members_group_id_idx;
drop index if exists proposals_group_id_idx;
-- redundant anyway: the unique constraint on groups.slug already has an index
drop index if exists groups_slug_idx;

-- Clear any corruption in the indexes that must remain (primary keys and the
-- slug unique constraint).
reindex table members;
reindex table groups;
reindex table proposals;
reindex table proposal_rsvps;
